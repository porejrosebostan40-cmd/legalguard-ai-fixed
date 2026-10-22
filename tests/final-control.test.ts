import { describe, expect, it } from 'vitest';
import type { ArbiterFinding, DeepSeekFinding, StrategyArgument } from '../src/core/legalguard.types';
import { runFinalControl } from '../src/services/final-control';

const documentText = 'Суд указал: осужденный не представил характеристику.';

function makeFinding(sourceQuote = 'осужденный не представил характеристику.'): DeepSeekFinding {
  return {
    id: 'F-001',
    claim: 'Суд указал на отсутствие характеристики.',
    sourceQuote,
    confidence: 0.9,
  };
}

function makeArbiterFinding(
  finding: DeepSeekFinding,
  status: ArbiterFinding['status'] = 'accepted',
): ArbiterFinding {
  return {
    ...finding,
    status,
    legalSignificance: 'medium',
    reasoning: 'Нужна сверка с материалами дела и применимыми нормами.',
  };
}

function makeStrategy(findingId = 'F-001'): StrategyArgument[] {
  return [{
    findingId,
    position: 1,
    heading: 'Проверяемый довод',
    argument: 'Черновой аргумент для проверки.',
  }];
}

describe('runFinalControl', () => {
  it('passes structural checks only when an accepted quote is present in the source', () => {
    const finding = makeFinding();
    const result = runFinalControl(
      documentText,
      [finding],
      [makeArbiterFinding(finding)],
      makeStrategy(),
    );

    expect(result.passed).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('юридическую проверку'))).toBe(true);
  });

  it('blocks an accepted finding when its quote is absent from the source', () => {
    const finding = makeFinding('В судебном заседании присутствовал свидетель.');
    const result = runFinalControl(
      documentText,
      [finding],
      [makeArbiterFinding(finding)],
      makeStrategy(),
    );

    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('не найдена в исходном тексте'))).toBe(true);
  });

  it('blocks findings marked for review', () => {
    const finding = makeFinding();
    const result = runFinalControl(
      documentText,
      [finding],
      [makeArbiterFinding(finding, 'needs_review')],
      makeStrategy(),
    );

    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('не прошло окончательное решение'))).toBe(true);
  });

  it('blocks unknown strategy identifiers', () => {
    const finding = makeFinding();
    const result = runFinalControl(
      documentText,
      [finding],
      [makeArbiterFinding(finding)],
      makeStrategy('F-999'),
    );

    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('неизвестное основание'))).toBe(true);
  });

  it('blocks an empty analysis and empty strategy', () => {
    const result = runFinalControl(documentText, [], [], []);

    expect(result.passed).toBe(false);
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });
});
