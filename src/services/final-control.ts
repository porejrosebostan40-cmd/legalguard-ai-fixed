import type {
  ArbiterFinding,
  CaseInfo,
  FinalControlResult,
  StrategyArgument,
} from '../core/legalguard.types';

function normalizeForComparison(value: string): string {
  return value.replace(/\\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

export function runFinalControl(
  documentText: string,
  findings: ArbiterFinding[],
  strategy: StrategyArgument[],
  caseInfo?: CaseInfo,
): FinalControlResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const knownIds = new Set<string>();
  const usedIds = new Set<string>();
  const normalizedDocument = normalizeForComparison(documentText);

  if (!documentText.trim()) {
    blockingReasons.push('Исходный судебный материал пуст.');
  }
  if (caseInfo) {
    const requiredFields: Array<[string, string]> = [
      ['номер дела', caseInfo.caseNumber],
      ['наименование суда', caseInfo.courtName],
      ['дата судебного акта', caseInfo.verdictDate],
    ];
    for (const [label, value] of requiredFields) {
      if (typeof value !== 'string' || !value.trim() || value.trim() === '—') {
        blockingReasons.push(`Не заполнено обязательное поле: ${label}.`);
      }
    }
  }

  if (findings.length === 0) {
    blockingReasons.push('Не выявлено проверяемых оснований. Это не означает, что нарушений нет: требуется содержательный анализ документа.');
  }

  for (const finding of findings) {
    const id = typeof finding.id === 'string' ? finding.id.trim() : '';
    if (!id) {
      blockingReasons.push('У одного из оснований отсутствует идентификатор.');
    } else if (knownIds.has(id)) {
      blockingReasons.push(`Идентификатор основания ${id} продублирован.`);
    }
    if (id) knownIds.add(id);

    if (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) {
      blockingReasons.push(`Основание ${id || '(без ID)'} имеет некорректную оценку уверенности.`);
    }

    if (!['pending', 'accepted', 'rejected', 'needs_review'].includes(finding.status)) {
      blockingReasons.push(`У основания ${id || '(без ID)'} указан неизвестный статус.`);
      continue;
    }

    if (finding.status === 'pending' || finding.status === 'needs_review') {
      blockingReasons.push(`Основание ${id || '(без ID)'} не прошло окончательную проверку.`);
    }

    if (finding.status === 'accepted') {
      const quote = typeof finding.sourceQuote === 'string' ? finding.sourceQuote.trim() : '';
      if (!quote) {
        blockingReasons.push(`У принятого основания ${id} отсутствует точная цитата из исходного документа.`);
      } else if (!normalizedDocument.includes(normalizeForComparison(quote))) {
        blockingReasons.push(`Цитата основания ${id} не найдена в исходном документе; требуется ручная сверка.`);
      }

      if (typeof finding.reasoning !== 'string' || !finding.reasoning.trim()) {
        blockingReasons.push(`У принятого основания ${id} отсутствует обоснование.`);
      }

      const legalBases = Array.isArray(finding.legalBasis)
        ? finding.legalBasis.filter((basis): basis is string => typeof basis === 'string').map((basis) => basis.trim()).filter(Boolean)
        : [];
      if (legalBases.length === 0) {
        blockingReasons.push(`У принятого основания ${id} не указана предполагаемая правовая основа.`);
      } else {
        // A legal norm normally will not be quoted inside the court act under review.
        // Its absence from that act is not evidence that the citation is invalid.
        warnings.push(`Правовую основу основания ${id} необходимо отдельно проверить по официальному источнику и редакции, действовавшей на юридически значимую дату.`);
      }
    }

    if (finding.status === 'rejected' && strategy.some((item) => item.findingId === id)) {
      blockingReasons.push(`Отклонённое основание ${id} попало в стратегию.`);
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

    if (!Number.isInteger(argument.position) || argument.position < 1) {
      blockingReasons.push(`У довода по основанию ${argument.findingId} некорректный порядковый номер.`);
    }
    if (typeof argument.heading !== 'string' || !argument.heading.trim()) {
      blockingReasons.push(`У довода по основанию ${argument.findingId} отсутствует заголовок.`);
    }
    if (typeof argument.argument !== 'string' || !argument.argument.trim()) {
      blockingReasons.push(`У довода по основанию ${argument.findingId} отсутствует текст аргумента.`);
    }
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

  if (findings.some((finding) => finding.status === 'accepted')) {
    warnings.push('Наличие цитаты и предполагаемой правовой ссылки не подтверждает правильность толкования нормы, её применимость или редакцию на нужную дату.');
  }

  return {
    passed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    checkedFindingIds: findings.map((finding) => finding.id),
  };
}
