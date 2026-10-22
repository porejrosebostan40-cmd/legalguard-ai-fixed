import { describe, expect, it } from 'vitest';
import type { ArbiterFinding, StrategyArgument } from '../core/legalguard.types';
import { runFinalControl } from './final-control';

const documentText = 'Суд установил, что осуждённый прибыл в суд 12 марта.';

function acceptedFinding(overrides: Partial<ArbiterFinding> = {}): ArbiterFinding {
  const defaultQuote = 'Суд установил, что осуждённый прибыл в суд 12 марта.';
  return {
    id: 'F-1',
    claim: 'Судебный вывод требует проверки',
    sourceQuote: defaultQuote,
    source: { documentId: 'Исходный материал', quote: overrides.sourceQuote ?? defaultQuote },
    legalBasis: ['статья 401.15 УПК РФ'],
    confidence: 0.8,
    status: 'accepted',
    legalSignificance: 'high',
    reasoning: 'Необходимо сопоставить вывод суда с исследованными материалами.',
    ...overrides,
  };
}

function strategy(overrides: Partial<StrategyArgument> = {}): StrategyArgument {
  return {
    findingId: 'F-1',
    position: 1,
    heading: 'Проверка вывода суда',
    argument: 'Сопоставить судебный вывод с материалами дела.',
    ...overrides,
  };
}

describe('runFinalControl', () => {
  it('does not require the cited law to appear inside the court decision text', () => {
    const result = runFinalControl(documentText, [acceptedFinding()], [strategy()]);
    expect(result.passed).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes('официальному источнику'))).toBe(true);
  });

  it('blocks an accepted finding whose quote is absent from the source document', () => {
    const result = runFinalControl(documentText, [acceptedFinding({ sourceQuote: 'Цитата, которой нет в документе.' })], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('Цитата основания F-1 не найдена'))).toBe(true);
  });

  it('blocks an accepted finding with a quote too short to ground the claim', () => {
    const quote = 'Суд постановил';
    const result = runFinalControl(documentText, [acceptedFinding({
      sourceQuote: quote,
      source: { documentId: 'Исходный материал', quote },
    })], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('слишком короткая'))).toBe(true);
  });

  it('blocks an accepted finding without structured source attribution', () => {
    const finding = acceptedFinding();
    delete finding.source;
    const result = runFinalControl(documentText, [finding], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('отсутствует структурированная ссылка'))).toBe(true);
  });

  it('blocks an accepted finding without a legal-basis lead', () => {
    const result = runFinalControl(documentText, [acceptedFinding({ legalBasis: [] })], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('не указана предполагаемая правовая основа'))).toBe(true);
  });

  it('blocks a strategy argument based on a rejected finding', () => {
    const result = runFinalControl(documentText, [acceptedFinding({ status: 'rejected' })], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('которое не принято'))).toBe(true);
  });

  it('blocks duplicate finding identifiers', () => {
    const result = runFinalControl(documentText, [acceptedFinding(), acceptedFinding()], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('продублирован'))).toBe(true);
  });

  it('blocks draft generation for an impossible court-act date', () => {
    const caseInfo = {
      caseNumber: '1-23/2026',
      courtName: 'Районный суд',
      verdictDate: '31.02.2026',
      clientName: 'Иванов Иван Иванович',
      recipientCourtName: 'Суд кассационной инстанции',
      complaintType: 'кассационная' as const,
    };
    const result = runFinalControl(documentText, [acceptedFinding()], [strategy()], caseInfo);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('календарно корректной'))).toBe(true);
  });

  it('blocks draft generation when applicant or recipient court is missing', () => {
    const caseInfo = {
      caseNumber: '1-23/2026',
      recipientCourtName: '—',
      courtName: 'Районный суд',
      verdictDate: '01.10.2026',
      clientName: '—',
      complaintType: 'кассационная' as const,
    };
    const result = runFinalControl(documentText, [acceptedFinding()], [strategy()], caseInfo);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('суд, в который подаётся жалоба'))).toBe(true);
    expect(result.blockingReasons.some((reason) => reason.includes('заявитель / осуждённый'))).toBe(true);
  });

  it('matches source quotes despite whitespace and line-break differences', () => {
    const finding = acceptedFinding({ sourceQuote: 'Суд установил, что\nосуждённый   прибыл в суд 12 марта.' });
    const result = runFinalControl(documentText, [finding], [strategy()]);
    expect(result.blockingReasons.some((reason) => reason.includes('Цитата основания F-1 не найдена'))).toBe(false);
  });

  it('does not accept a generated document-boundary label as a court quote', () => {
    const boundary = '=== НАЧАЛО ДОКУМЕНТА: decision.txt ===';
    const wrappedText = `${boundary}\n${documentText}\n=== КОНЕЦ ДОКУМЕНТА: decision.txt ===`;
    const result = runFinalControl(wrappedText, [acceptedFinding({ sourceQuote: boundary })], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('Цитата основания F-1 не найдена'))).toBe(true);
  });

  it('blocks source metadata that does not match the checked quotation', () => {
    const result = runFinalControl(
      documentText,
      [acceptedFinding({ source: { documentId: 'Исходный материал', quote: 'Другая фраза из документа.' } })],
      [strategy()],
    );
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes('не совпадает с цитатой'))).toBe(true);
  });

  it('blocks empty source documents', () => {
    const result = runFinalControl('  ', [acceptedFinding()], [strategy()]);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.toLocaleLowerCase('ru-RU').includes('исходный судебный материал пуст'))).toBe(true);
  });
});
