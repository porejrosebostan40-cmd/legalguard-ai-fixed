import type { ArbiterFinding } from '../core/legalguard.types';

export function areAllFindingsReviewed(
  findings: Pick<ArbiterFinding, 'id' | 'status'>[],
  reviewedIds: string[],
): boolean {
  const hasAcceptedFinding = findings.some((finding) => finding.status === 'accepted');
  return hasAcceptedFinding && findings.every((finding) => reviewedIds.includes(finding.id));
}
