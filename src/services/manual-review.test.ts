import { describe, expect, it } from 'vitest';
import type { ArbiterFinding } from '../core/legalguard.types';
import { areAllAcceptedFindingsReviewed } from './manual-review';

const finding = (id: string, status: ArbiterFinding['status']): Pick<ArbiterFinding, 'id' | 'status'> => ({ id, status });

describe('manual review gate', () => {
  it('does not pass when there are no accepted findings', () => {
    expect(areAllAcceptedFindingsReviewed([finding('F-1', 'rejected')], ['F-1'])).toBe(false);
    expect(areAllAcceptedFindingsReviewed([], [])).toBe(false);
  });

  it('blocks when any accepted finding remains unchecked', () => {
    expect(areAllAcceptedFindingsReviewed([finding('F-1', 'accepted'), finding('F-2', 'accepted')], ['F-1'])).toBe(false);
  });

  it('passes only when every accepted finding has a review acknowledgement', () => {
    expect(areAllAcceptedFindingsReviewed([finding('F-1', 'accepted'), finding('F-2', 'accepted'), finding('F-3', 'rejected')], ['F-1', 'F-2'])).toBe(true);
  });

  it('does not require acknowledgements for findings not accepted', () => {
    expect(areAllAcceptedFindingsReviewed([finding('F-1', 'accepted'), finding('F-2', 'needs_review'), finding('F-3', 'pending')], ['F-1'])).toBe(true);
  });
});
