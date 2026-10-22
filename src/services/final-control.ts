import type {
  ArbiterFinding,
  FinalControlResult,
  StrategyArgument,
} from '../core/legalguard.types';

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

export function runFinalControl(
  documentText: string,
  findings: ArbiterFinding[],
  strategy: StrategyArgument[],
): FinalControlResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const knownIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const usedIds = new Set<string>();
  const normalizedDocument = normalizeForComparison(documentText);

  if (findings.length === 0) {
    blockingReasons.push('Не выявлено проверяемых оснований. Это не означает, что нарушений нет: требуется содержательный анализ документа.');
  }

  for (const finding of findings) {
    if (knownIds.has(finding.id)) {
      duplicateIds.add(finding.id);
      blockingReasons.push(`Идентификатор основания ${finding.id} продублирован.`);
    }
    knownIds.add(finding.id);

    if (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) {
      blockingReasons.push(`Основание ${finding.id} имеет некорректную оценку уверенности.`);
    }

    if (finding.status === 'pending' || finding.status === 'needs_review') {
      blockingReasons.push(`Основание ${finding.id} не прошло окончательную проверку.`);
    }

    if (finding.status === 'accepted') {
      const quote = finding.sourceQuote?.trim();
      if (!quote) {
        blockingReasons.push(`У принятого основания ${finding.id} отсутствует точная цитата из исходного документа.`);
      } else if (!normalizedDocument.includes(normalizeForComparison(quote))) {
        blockingReasons.push(`Цитата основания ${finding.id} не найдена в исходном документе; требуется ручная сверка.`);
      }

      if (!finding.reasoning.trim()) {
        blockingReasons.push(`У принятого основания ${finding.id} отсутствует обоснование.`);
      }
      const legalBases = (finding.legalBasis ?? []).map((basis) => basis.trim()).filter(Boolean);
      if (legalBases.length === 0) {
        blockingReasons.push(`У принятого основания ${finding.id} не указана правовая основа.`);
      } else {
        for (const basis of legalBases) {
          if (!normalizedDocument.includes(normalizeForComparison(basis))) {
            blockingReasons.push(`Правовая ссылка «${basis}» у основания ${finding.id} не найдена в предоставленных материалах. Её применимость и редакцию нельзя считать проверенными.`);
          }
        }
      }
    }

    if (finding.status === 'rejected' && strategy.some((item) => item.findingId === finding.id)) {
      blockingReasons.push(`Отклонённое основание ${finding.id} попало в стратегию.`);
    }
  }

  for (const argument of strategy) {
    if (!knownIds.has(argument.findingId)) {
      blockingReasons.push(`Стратегия содержит неизвестное основание ${argument.findingId}.`);
    } else if (!findings.some((finding) => finding.id === argument.findingId && finding.status === 'accepted')) {
      blockingReasons.push(`В стратегию включено основание ${argument.findingId}, которое не принято.`);
    }
    if (usedIds.has(argument.findingId)) {
      blockingReasons.push(`Основание ${argument.findingId} продублировано в стратегии.`);
    }
    usedIds.add(argument.findingId);
  }

  for (const finding of findings) {
    if (finding.status === 'accepted' && !usedIds.has(finding.id)) {
      blockingReasons.push(`Принятое основание ${finding.id} отсутствует в стратегии.`);
    }
  }

  if (!findings.some((finding) => finding.status === 'accepted')) {
    blockingReasons.push('Нет оснований, которые прошли проверку и могут быть включены в проект жалобы.');
  }
  if (strategy.length === 0) {
    blockingReasons.push('Стратегия защиты пуста; проект жалобы не формируется.');
  }
  if (duplicateIds.size > 0) {
    warnings.push('Обнаружены повторяющиеся идентификаторы; результаты анализа нельзя считать надёжными.');
  }

  if (findings.some((finding) => finding.status === 'accepted')) {
    warnings.push('Наличие цитаты и правовой ссылки в материалах не подтверждает правильность толкования нормы и её редакцию на нужную дату.');
  }

  return {
    passed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    checkedFindingIds: findings.map((finding) => finding.id),
  };
}
