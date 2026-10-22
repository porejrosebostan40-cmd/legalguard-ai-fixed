import type {
  ArbiterFinding,
  DeepSeekFinding,
  FindingStatus,
  LegalSignificance,
} from '../core/legalguard.types';

const findingStatuses = new Set<FindingStatus>(['pending', 'accepted', 'rejected', 'needs_review']);
const legalSignificances = new Set<LegalSignificance>(['high', 'medium', 'low', 'none']);
const criticStatuses = new Set(['clear', 'concern', 'needs_review']);
const MAX_FINDINGS_PER_CHUNK = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${context}: поле «${key}» должно быть непустой строкой.`);
  }
  return value;
}

function validateCommonFinding(value: unknown, index: number, context: string): DeepSeekFinding {
  if (!isRecord(value)) throw new Error(`${context}: основание №${index + 1} имеет неверный формат.`);
  const id = requireString(value, 'id', context);
  requireString(value, 'claim', context);
  if (value.sourceQuote !== undefined && typeof value.sourceQuote !== 'string') {
    throw new Error(`${context}: sourceQuote у основания ${id} должен быть строкой.`);
  }
  if (value.legalBasis !== undefined &&
      (!Array.isArray(value.legalBasis) || !value.legalBasis.every((item) => typeof item === 'string'))) {
    throw new Error(`${context}: legalBasis у основания ${id} должен быть массивом строк.`);
  }
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) ||
      value.confidence < 0 || value.confidence > 1) {
    throw new Error(`${context}: confidence у основания ${id} должен быть числом от 0 до 1.`);
  }
  return value as unknown as DeepSeekFinding;
}

function assertUniqueIds(findings: DeepSeekFinding[], context: string): void {
  const ids = new Set<string>();
  for (const finding of findings) {
    if (ids.has(finding.id)) throw new Error(`${context}: повторяющийся ID основания «${finding.id}».`);
    ids.add(finding.id);
  }
}

export function validateAnalystFindings(value: unknown): DeepSeekFinding[] {
  if (!Array.isArray(value)) throw new Error('Первый этап вернул неверный формат: findings должен быть массивом.');
  if (value.length > MAX_FINDINGS_PER_CHUNK) throw new Error(`Первый этап вернул более ${MAX_FINDINGS_PER_CHUNK} оснований для одного фрагмента; результат остановлен, а не обрезан.`);
  const findings = value.map((item, index) => validateCommonFinding(item, index, 'Первый этап'));
  assertUniqueIds(findings, 'Первый этап');
  return findings;
}

export function validateArbiterFindings(value: unknown): ArbiterFinding[] {
  if (!Array.isArray(value)) throw new Error('Второй этап вернул неверный формат: findings должен быть массивом.');
  if (value.length > MAX_FINDINGS_PER_CHUNK) throw new Error(`Второй этап вернул более ${MAX_FINDINGS_PER_CHUNK} оснований для одного фрагмента; результат остановлен, а не обрезан.`);
  const findings = value.map((item, index) => {
    const common = validateCommonFinding(item, index, 'Второй этап');
    if (!isRecord(item)) throw new Error(`Второй этап: основание №${index + 1} имеет неверный формат.`);
    if (typeof item.status !== 'string' || !findingStatuses.has(item.status as FindingStatus)) {
      throw new Error(`Второй этап: неизвестный status у основания ${common.id}.`);
    }
    if (typeof item.legalSignificance !== 'string' || !legalSignificances.has(item.legalSignificance as LegalSignificance)) {
      throw new Error(`Второй этап: неизвестный legalSignificance у основания ${common.id}.`);
    }
    requireString(item, 'reasoning', 'Второй этап');
    if (item.appealCassationRelevance !== undefined && typeof item.appealCassationRelevance !== 'string') {
      throw new Error(`Второй этап: appealCassationRelevance у основания ${common.id} должен быть строкой.`);
    }
    return item as unknown as ArbiterFinding;
  });
  assertUniqueIds(findings, 'Второй этап');
  return findings;
}

export interface CriticReview {
  id: string;
  status: 'clear' | 'concern' | 'needs_review';
  critique: string;
}

export function validateCriticReviews(value: unknown): CriticReview[] {
  if (!Array.isArray(value)) throw new Error('Третий этап вернул неверный формат: reviews должен быть массивом.');
  if (value.length > MAX_FINDINGS_PER_CHUNK) throw new Error(`Третий этап вернул более ${MAX_FINDINGS_PER_CHUNK} проверок для одного фрагмента; результат остановлен, а не обрезан.`);
  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Третий этап: проверка №${index + 1} имеет неверный формат.`);
    const id = requireString(item, 'id', 'Третий этап');
    if (ids.has(id)) throw new Error(`Третий этап: повторяющаяся проверка ID «${id}».`);
    ids.add(id);
    if (typeof item.status !== 'string' || !criticStatuses.has(item.status)) {
      throw new Error(`Третий этап: неизвестный статус критической проверки основания ${id}.`);
    }
    requireString(item, 'critique', 'Третий этап');
    return item as unknown as CriticReview;
  });
}
