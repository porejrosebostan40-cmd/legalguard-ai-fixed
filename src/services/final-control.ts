import type {
  ArbiterFinding,
  DeepSeekFinding,
  FinalControlResult,
  StrategyArgument,
} from '../core/legalguard.types';

function normalizeForQuoteMatch(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function runFinalControl(
  documentText: string,
  findings: DeepSeekFinding[],
  arbiterFindings: ArbiterFinding[],
  strategy: StrategyArgument[],
): FinalControlResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [
    'Этот автоматический контроль не проверяет правильность толкования закона, актуальность судебной практики, сроки или процессуальную допустимость жалобы. Требуется независимая юридическая проверка.',
  ];

  const sourceText = normalizeForQuoteMatch(documentText);
  const findingIds = findings.map((finding) => finding.id);
  const arbiterIds = arbiterFindings.map((finding) => finding.id);
  const knownIds = new Set(findingIds);
  const arbiterIdSet = new Set(arbiterIds);
  const usedIds = new Set<string>();

  if (!sourceText) blockingReasons.push('Исходный текст судебного материала пуст.');
  if (findings.length === 0) blockingReasons.push('Первичный анализ не сформировал оснований для проверки.');
  if (arbiterFindings.length === 0) blockingReasons.push('Арбитр не вернул ни одного решения.');
  if (strategy.length === 0) blockingReasons.push('Стратегия пуста: нельзя формировать черновик жалобы без проверяемых доводов.');

  for (const id of new Set(findingIds)) {
    if (findingIds.filter((candidate) => candidate === id).length > 1) {
      blockingReasons.push(`Первичный анализ содержит повторяющийся идентификатор ${id}.`);
    }
  }

  for (const id of new Set(arbiterIds)) {
    if (arbiterIds.filter((candidate) => candidate === id).length > 1) {
      blockingReasons.push(`Арбитр вернул несколько решений для идентификатора ${id}.`);
    }
  }

  for (const finding of findings) {
    if (!arbiterIdSet.has(finding.id)) {
      blockingReasons.push(`Для основания ${finding.id} отсутствует решение Арбитра.`);
    }
  }

  for (const finding of arbiterFindings) {
    if (!knownIds.has(finding.id)) {
      blockingReasons.push(`Арбитр вернул неизвестное основание ${finding.id}.`);
    }
    if (finding.status === 'pending' || finding.status === 'needs_review') {
      blockingReasons.push(`Основание ${finding.id} не прошло окончательное решение Арбитра.`);
    }
    if (finding.status === 'accepted') {
      const primaryFinding = findings.find((item) => item.id === finding.id);
      const primaryQuote = primaryFinding?.source?.quote || primaryFinding?.sourceQuote;
      const arbiterQuote = finding.source?.quote || finding.sourceQuote;
      if (!primaryQuote?.trim()) {
        blockingReasons.push(`Принятое основание ${finding.id} не содержит проверяемой цитаты в результате первичного анализа.`);
      } else if (arbiterQuote && normalizeForQuoteMatch(arbiterQuote) !== normalizeForQuoteMatch(primaryQuote)) {
        blockingReasons.push(`Арбитр изменил исходную цитату основания ${finding.id}; требуется проверка.`);
      } else if (!sourceText.includes(normalizeForQuoteMatch(primaryQuote))) {
        blockingReasons.push(`Цитата основания ${finding.id} не найдена в исходном тексте; основание нельзя считать подтверждённым.`);
      }
    }
    if (finding.status === 'rejected' && strategy.some((item) => item.findingId === finding.id)) {
      blockingReasons.push(`Отклонённое основание ${finding.id} попало в стратегию.`);
    }
  }

  for (const argument of strategy) {
    if (!knownIds.has(argument.findingId)) {
      blockingReasons.push(`Стратегия содержит неизвестное основание ${argument.findingId}.`);
    }
    if (usedIds.has(argument.findingId)) {
      blockingReasons.push(`Основание ${argument.findingId} продублировано в стратегии.`);
    }
    usedIds.add(argument.findingId);

    const matchingFinding = arbiterFindings.find((finding) => finding.id === argument.findingId);
    if (matchingFinding?.status !== 'accepted') {
      blockingReasons.push(`В стратегию включено основание ${argument.findingId}, не имеющее статуса accepted.`);
    }
  }

  for (const finding of arbiterFindings) {
    if (finding.status === 'accepted' && !usedIds.has(finding.id)) {
      warnings.push(`Принятое основание ${finding.id} не использовано в стратегии.`);
    }
  }

  return {
    passed: blockingReasons.length === 0,
    blockingReasons: [...new Set(blockingReasons)],
    warnings,
    checkedFindingIds: [...new Set(arbiterIds)],
  };
}
