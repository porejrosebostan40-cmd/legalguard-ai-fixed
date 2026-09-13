import type {
  ArbiterFinding,
  FinalControlResult,
  StrategyArgument,
} from '../core/legalguard.types';

export function runFinalControl(
  findings: ArbiterFinding[],
  strategy: StrategyArgument[],
): FinalControlResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const checkedFindingIds = findings.map((finding) => finding.id);
  const knownIds = new Set(checkedFindingIds);
  const usedIds = new Set<string>();

  for (const finding of findings) {
    if (finding.status === 'pending' || finding.status === 'needs_review') {
      blockingReasons.push(`Основание ${finding.id} не прошло окончательное решение Арбитра.`);
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
  }

  for (const finding of findings) {
    if (finding.status === 'accepted' && !usedIds.has(finding.id)) {
      warnings.push(`Принятое основание ${finding.id} не использовано в стратегии.`);
    }
  }

  return {
    passed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    checkedFindingIds,
  };
}
