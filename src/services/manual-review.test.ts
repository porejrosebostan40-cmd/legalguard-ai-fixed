import { describe, expect, it } from 'vitest';
import type { ArbiterFinding } from '../core/legalguard.types';
import { areAllFindingsReviewed } from './manual-review';

const finding = (id: string, status: ArbiterFinding['status']): Pick<ArbiterFinding, 'id' | 'status'> => ({ id, status });

describe('manual review gate', () => {
  it('does not pass when there are no accepted findings', () => {
    expect(areAllFindingsReviewed([finding('F-1', 'rejected')], ['F-1'])).toBe(false);
    expect(areAllFindingsReviewed([], [])).toBe(false);
  });

  it('blocks when any accepted finding remains unchecked', () => {
    expect(areAllFindingsReviewed([finding('F-1', 'accepted'), finding('F-2', 'accepted')], ['F-1'])).toBe(false);
  });

  it('blocks until every candidate has been manually reviewed', () => {
    const findings = [
      finding('F-1', 'accepted'),
      finding('F-2', 'rejected'),
      finding('F-3', 'needs_review'),
      finding('F-4', 'pending'),
    ];
    expect(areAllFindingsReviewed(findings, ['F-1', 'F-2', 'F-3'])).toBe(false);
    expect(areAllFindingsReviewed(findings, ['F-1', 'F-2', 'F-3', 'F-4'])).toBe(true);
  });
});
