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
  clientName: '—',
  complaintType: 'кассационная',
};

function providers(arbiterFinding: ArbiterFinding = accepted): AIProviderSet {
  return {
    deepSeek: { analyze: async () => [candidate] },
    chatGPT: { arbitrate: async () => [arbiterFinding] },
  };
}

describe('LegalGuard draft generation', () => {
  it('shows candidate legal references as explicitly unverified', async () => {
    const result = await new LegalGuardPipeline(providers()).run(documentText, caseInfo);
    expect(result.finalControl?.passed).toBe(true);
    expect(result.finalDocument).toContain('Предполагаемая правовая основа (НЕ ПРОВЕРЕНА): статья 401.15 УПК РФ');
    expect(result.readyForSubmission).toBe(false);
  });

  it('does not generate a draft when an accepted finding lacks an exact source quote', async () => {
    const badFinding = { ...accepted, sourceQuote: 'Фразы нет в исходном документе.' };
    const result = await new LegalGuardPipeline(providers(badFinding)).run(documentText, caseInfo);
    expect(result.finalControl?.passed).toBe(false);
    expect(result.finalDocument).toBeNull();
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
