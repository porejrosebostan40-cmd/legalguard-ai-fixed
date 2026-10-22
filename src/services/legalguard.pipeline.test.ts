import { describe, expect, it } from 'vitest';
import type { AIProviderSet, CaseInfo, ArbiterFinding, DeepSeekFinding } from '../core/legalguard.types';
import { LegalGuardPipeline } from './legalguard.pipeline';

const documentText = 'Суд указал, что обстоятельство X установлено.';

const candidate: DeepSeekFinding = {
  id: 'F-1',
  claim: 'Требуется проверить мотивировку судебного вывода',
  sourceQuote: 'Суд указал, что обстоятельство X установлено.',
  legalBasis: ['статья 401.15 УПК РФ'],
  confidence: 0.7,
};

const accepted: ArbiterFinding = {
  ...candidate,
  status: 'accepted',
  legalSignificance: 'high',
  reasoning: 'Нужно сопоставить вывод с доказательствами и мотивировкой судебного акта.',
};

const caseInfo: CaseInfo = {
  caseNumber: '1-23/2026',
  courtName: 'Районный суд',
  verdictDate: '01.10.2026',
  clientName: 'Иванов Иван Иванович',
  recipientCourtName: 'Суд кассационной инстанции',
  complaintType: 'кассационная',
};

function providers(arbiterFinding: ArbiterFinding = accepted): AIProviderSet {
  return {
    deepSeek: { analyze: async () => [candidate] },
    chatGPT: {
      arbitrate: async (_documentText, findings) => findings.map((finding) => ({
        ...finding,
        ...arbiterFinding,
        id: finding.id,
        status: arbiterFinding.status,
        legalSignificance: arbiterFinding.legalSignificance,
        reasoning: arbiterFinding.reasoning,
      })),
    },
  };
}

describe('LegalGuard draft generation', () => {
  it('shows candidate legal references as explicitly unverified', async () => {
    const result = await new LegalGuardPipeline(providers()).run(documentText, caseInfo);
    expect(result.finalControl?.passed).toBe(true);
    expect(result.finalDocument).toContain('Предполагаемая правовая основа (НЕ ПРОВЕРЕНА): статья 401.15 УПК РФ');
    expect(result.finalDocument).toContain('https://publication.pravo.gov.ru/search');
    expect(result.finalDocument).toContain('https://pravo.minjust.ru/');
    expect(result.readyForSubmission).toBe(false);
  });

  it('attributes a quotation to the unique uploaded source file', async () => {
    const multiDocumentText = [
      '=== НАЧАЛО ДОКУМЕНТА: decision.txt ===',
      documentText,
      '=== КОНЕЦ ДОКУМЕНТА: decision.txt ===',
      '',
      '=== НАЧАЛО ДОКУМЕНТА: appeal.txt ===',
      'Заявитель просит проверить судебный вывод.',
      '=== КОНЕЦ ДОКУМЕНТА: appeal.txt ===',
    ].join('\n');
    const result = await new LegalGuardPipeline(providers()).run(multiDocumentText, caseInfo);
    expect(result.finalControl?.passed).toBe(true);
    expect(result.arbiterFindings[0].source?.documentId).toBe('decision.txt');
  });

  it('blocks a draft when the same quotation cannot be attributed to one source file', async () => {
    const multiDocumentText = [
      '=== НАЧАЛО ДОКУМЕНТА: decision.txt ===',
      documentText,
      '=== КОНЕЦ ДОКУМЕНТА: decision.txt ===',
      '',
      '=== НАЧАЛО ДОКУМЕНТА: appeal.txt ===',
      documentText,
      '=== КОНЕЦ ДОКУМЕНТА: appeal.txt ===',
    ].join('\n');
    const result = await new LegalGuardPipeline(providers()).run(multiDocumentText, caseInfo);
    expect(result.finalControl?.passed).toBe(false);
    expect(result.finalControl?.blockingReasons.some((reason) => reason.includes('исходный файл цитаты'))).toBe(true);
    expect(result.finalDocument).toBeNull();
  });

  it('reports analysis and arbitration progress for each chunk', async () => {
    const progress: Array<{ currentChunk: number; totalChunks: number; stage: string }> = [];
    const result = await new LegalGuardPipeline(providers(), (event) => progress.push(event)).run(documentText, caseInfo);
    expect(result.finalControl?.passed).toBe(true);
    expect(progress.map((event) => event.stage)).toEqual(['analyst', 'arbiter', 'chunk-complete', 'complete']);
    expect(progress.every((event) => event.currentChunk === 1 && event.totalChunks === 1)).toBe(true);
  });

  it('analyzes long documents in multiple chunks and namespaces finding IDs', async () => {
    const longDocument = Array.from({ length: 140 }, () => documentText).join('\n\n');
    let analyzedChunks = 0;
    const chunkProviders: AIProviderSet = {
      deepSeek: {
        analyze: async () => {
          analyzedChunks += 1;
          return [candidate];
        },
      },
      chatGPT: {
        arbitrate: async (_chunk, findings) => findings.map((finding) => ({
          ...accepted,
          ...finding,
          status: 'accepted' as const,
          legalSignificance: 'high',
          reasoning: accepted.reasoning,
        })),
      },
    };
    const result = await new LegalGuardPipeline(chunkProviders).run(longDocument, caseInfo);
    expect(analyzedChunks).toBeGreaterThan(1);
    expect(result.findings.every((finding) => finding.id.startsWith('C'))).toBe(true);
    expect(result.finalDocument).not.toBeNull();
  });

  it('stops safely when a document exceeds the chunk limit', async () => {
    const tooLong = documentText.repeat(6000);
    await expect(new LegalGuardPipeline(providers()).run(tooLong, caseInfo)).rejects.toThrow('превышает безопасный предел');
  });

  it('stops when the arbiter changes an analyst source quote', async () => {
    const badFinding = { ...accepted, sourceQuote: 'Фразы нет в исходном документе.' };
    await expect(new LegalGuardPipeline(providers(badFinding)).run(documentText, caseInfo)).rejects.toThrow('изменил цитату-основание');
  });

  it('does not generate a draft while required case metadata is missing', async () => {
    const incompleteCase = { ...caseInfo, caseNumber: '—' };
    const result = await new LegalGuardPipeline(providers()).run(documentText, incompleteCase);
    expect(result.finalControl?.passed).toBe(false);
    expect(result.finalControl?.blockingReasons.some((reason) => reason.includes('номер дела'))).toBe(true);
    expect(result.finalDocument).toBeNull();
  });

  it('keeps findings that need review out of the generated draft', async () => {
    const reviewFinding = { ...accepted, status: 'needs_review' as const };
    const result = await new LegalGuardPipeline(providers(reviewFinding)).run(documentText, caseInfo);
    expect(result.finalControl?.passed).toBe(false);
    expect(result.finalDocument).toBeNull();
  });
});
