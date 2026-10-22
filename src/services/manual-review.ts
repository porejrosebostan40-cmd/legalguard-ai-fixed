import type { ArbiterFinding } from '../core/legalguard.types';

export function areAllAcceptedFindingsReviewed(findings: Pick<ArbiterFinding, 'id' | 'status'>[], reviewedIds: string[]): boolean {
  const acceptedIds = findings.filter((finding) => finding.status === 'accepted').map((finding) => finding.id);
  return acceptedIds.length > 0 && acceptedIds.every((id) => reviewedIds.includes(id));
}
