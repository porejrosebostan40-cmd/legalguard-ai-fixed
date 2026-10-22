import type { ArbiterFinding, DeepSeekFinding } from '../core/legalguard.types';

/**
 * Ensures the arbiter evaluates exactly the candidate set produced by the analyst.
 * It must not silently drop a candidate or introduce a new one under an invented ID.
 */
export function validateArbiterCoverage(
  candidates: DeepSeekFinding[],
  reviewed: ArbiterFinding[],
): ArbiterFinding[] {
  const candidateIds = new Set(candidates.map((finding) => finding.id));
  const reviewedIds = new Set(reviewed.map((finding) => finding.id));
  const unknownIds = [...reviewedIds].filter((id) => !candidateIds.has(id));
  const missingIds = [...candidateIds].filter((id) => !reviewedIds.has(id));

  if (unknownIds.length > 0) {
    throw new Error(`Арбитр добавил основания, которых не было у аналитика: ${unknownIds.join(', ')}. Конвейер остановлен.`);
  }
  if (missingIds.length > 0) {
    throw new Error(`Арбитр не вынес оценку по основаниям аналитика: ${missingIds.join(', ')}. Конвейер остановлен.`);
  }

  const candidateById = new Map(candidates.map((finding) => [finding.id, finding]));
  for (const finding of reviewed) {
    const candidate = candidateById.get(finding.id);
    const originalQuote = candidate?.sourceQuote?.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
    const reviewedQuote = finding.sourceQuote?.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
    if (!originalQuote) {
      throw new Error(`Аналитик не указал точную цитату для основания ${finding.id}; конвейер остановлен до арбитража.`);
    }
    if (!reviewedQuote || originalQuote !== reviewedQuote) {
      throw new Error(`Арбитр изменил или удалил цитату-основание ${finding.id}. Источник должен быть сверен заново; конвейер остановлен.`);
    }
  }

  return reviewed;
}
