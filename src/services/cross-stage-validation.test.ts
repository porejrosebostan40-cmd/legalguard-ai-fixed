import { describe, expect, it } from 'vitest';
import type { ArbiterFinding, DeepSeekFinding } from '../core/legalguard.types';
import { validateArbiterCoverage } from './cross-stage-validation';

const candidate = (id: string): DeepSeekFinding => ({
  id,
  claim: `Проверить вывод ${id}`,
  sourceQuote: 'Суд установил обстоятельство X.',
  legalBasis: [],
  confidence: 0.5,
});

const reviewed = (id: string): ArbiterFinding => ({
  ...candidate(id),
  status: 'needs_review',
  legalSignificance: 'medium',
  reasoning: 'Недостаточно контекста для окончательного вывода.',
});

describe('cross-stage candidate coverage', () => {
  it('accepts matching candidate and arbiter ID sets', () => {
    expect(validateArbiterCoverage([candidate('F-1'), candidate('F-2')], [reviewed('F-2'), reviewed('F-1')])).toHaveLength(2);
  });

  it('rejects an ID invented by the arbiter', () => {
    expect(() => validateArbiterCoverage([candidate('F-1')], [reviewed('F-1'), reviewed('F-9')])).toThrow('добавил основания');
  });

  it('rejects a candidate silently omitted by the arbiter', () => {
    expect(() => validateArbiterCoverage([candidate('F-1'), candidate('F-2')], [reviewed('F-1')])).toThrow('не вынес оценку');
  });

  it('rejects an arbiter that silently changes the analyst quote', () => {
    expect(() => validateArbiterCoverage(
      [candidate('F-1')],
      [{ ...reviewed('F-1'), sourceQuote: 'Другой фрагмент судебного акта.' }],
    )).toThrow('изменил цитату-основание');
  });

  it('accepts an empty set only when both stages return no findings', () => {
    expect(validateArbiterCoverage([], [])).toEqual([]);
    expect(() => validateArbiterCoverage([], [reviewed('F-1')])).toThrow('добавил основания');
  });
});
