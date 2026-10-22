import { describe, expect, it } from 'vitest';
import {
  validateAnalystFindings,
  validateArbiterFindings,
  validateCriticReviews,
} from './provider-validation';

const analystFinding = {
  id: 'F-1',
  claim: 'Проверить мотивировку',
  sourceQuote: 'Суд указал обстоятельство X.',
  legalBasis: ['статья 401.15 УПК РФ'],
  confidence: 0.75,
};

const arbiterFinding = {
  ...analystFinding,
  status: 'needs_review',
  legalSignificance: 'medium',
  reasoning: 'В предоставленных материалах недостаточно контекста.',
};

describe('AI provider output validation', () => {
  it('accepts a well-formed analyst response', () => {
    expect(validateAnalystFindings([analystFinding])).toHaveLength(1);
  });

  it('rejects duplicate analyst IDs', () => {
    expect(() => validateAnalystFindings([analystFinding, analystFinding])).toThrow('повторяющийся ID');
  });

  it('rejects confidence outside the documented range', () => {
    expect(() => validateAnalystFindings([{ ...analystFinding, confidence: 1.2 }])).toThrow('от 0 до 1');
  });

  it('rejects malformed legalBasis instead of trusting a type cast', () => {
    expect(() => validateAnalystFindings([{ ...analystFinding, legalBasis: '401.15 УПК РФ' }])).toThrow('массивом строк');
  });

  it('rejects an unknown arbiter status', () => {
    expect(() => validateArbiterFindings([{ ...arbiterFinding, status: 'probably_yes' }])).toThrow('неизвестный status');
  });

  it('rejects missing arbiter reasoning', () => {
    const { reasoning: _reasoning, ...withoutReasoning } = arbiterFinding;
    expect(() => validateArbiterFindings([withoutReasoning])).toThrow('reasoning');
  });

  it('accepts an explicit needs_review status', () => {
    expect(validateArbiterFindings([arbiterFinding])[0].status).toBe('needs_review');
  });

  it('rejects unknown critic status', () => {
    expect(() => validateCriticReviews([{ id: 'F-1', status: 'approve', critique: 'OK' }])).toThrow('неизвестный статус');
  });

  it('rejects duplicate critic reviews', () => {
    const review = { id: 'F-1', status: 'clear', critique: 'Проверка пройдена.' };
    expect(() => validateCriticReviews([review, review])).toThrow('повторяющаяся проверка ID');
  });

  it('rejects a critic review with an empty critique', () => {
    expect(() => validateCriticReviews([{ id: 'F-1', status: 'concern', critique: ' ' }])).toThrow('critique');
  });
});
