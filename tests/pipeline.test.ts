import { describe, expect, it, vi } from 'vitest';
import type { AIProviderSet, CaseInfo, DeepSeekFinding } from '../src/core/legalguard.types';
import { LegalGuardPipeline } from '../src/services/legalguard.pipeline';

const caseInfo: CaseInfo = {
  caseNumber: '1-23/2026',
  courtName: 'Проверочный суд',
  verdictDate: '22.10.2026',
  clientName: '—',
  complaintType: 'кассационная',
};

const source = 'Суд указал: осужденный не представил характеристику.';

function providersFor(quote: string): AIProviderSet {
  const finding: DeepSeekFinding = {
    id: 'F-001',
    claim: 'Суд сослался на отсутствие характеристики.',
    sourceQuote: quote,
    confidence: 0.9,
  };

  return {
    analyst: { analyze: vi.fn().mockResolvedValue([finding]) },
    arbiter: {
      arbitrate: vi.fn().mockResolvedValue([{
        ...finding,
        status: 'accepted',
        legalSignificance: 'medium',
        reasoning: 'Требуется проверить, подтверждается ли этот вывод материалами дела.',
      }]),
    },
  };
}

describe('LegalGuardPipeline', () => {
  it('creates a draft when source grounding passes but never marks it ready to file', async () => {
    const pipeline = new LegalGuardPipeline(providersFor('осужденный не представил характеристику.'));
    const result = await pipeline.run(source, caseInfo);

    expect(result.finalControl?.passed).toBe(true);
    expect(result.finalDocument).toContain('ЧЕРНОВИК ДОВОДОВ К КАССАЦИОННОЙ ЖАЛОБЕ');
    expect(result.finalDocument).toContain('Подтверждающая цитата');
    expect(result.finalDocument).toContain('не готовая к подаче');
    expect(result.readyForSubmission).toBe(false);
  });

  it('blocks the draft when the model invents a quotation', async () => {
    const pipeline = new LegalGuardPipeline(providersFor('В тексте нет такой фразы.'));
    const result = await pipeline.run(source, caseInfo);

    expect(result.finalControl?.passed).toBe(false);
    expect(result.finalDocument).toBeNull();
    expect(result.readyForSubmission).toBe(false);
  });

  it('stops before calling AI providers when the source is empty', async () => {
    const providers = providersFor('осужденный не представил характеристику.');
    const pipeline = new LegalGuardPipeline(providers);
    const result = await pipeline.run('   ', caseInfo);

    expect(result.finalDocument).toBeNull();
    expect(result.findings).toHaveLength(0);
    expect(providers.analyst.analyze).not.toHaveBeenCalled();
    expect(providers.arbiter.arbitrate).not.toHaveBeenCalled();
  });
});
