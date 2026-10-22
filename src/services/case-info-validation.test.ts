import { describe, expect, it } from 'vitest';
import type { CaseInfo } from '../core/legalguard.types';
import { isValidCourtDate, validateCaseInfo } from './case-info-validation';

const validCase: CaseInfo = {
  caseNumber: '1-23/2026',
  recipientCourtName: 'Суд кассационной инстанции',
  clientName: 'Иванов Иван Иванович',
  courtName: 'Районный суд',
  verdictDate: '01.10.2026',
  complaintType: 'кассационная',
};

describe('case metadata preflight', () => {
  it('accepts complete case details with a valid date', () => {
    expect(validateCaseInfo(validCase)).toEqual([]);
  });

  it('reports every missing required field', () => {
    const reasons = validateCaseInfo({ ...validCase, caseNumber: '—', clientName: '', recipientCourtName: '—' });
    expect(reasons).toHaveLength(3);
    expect(reasons.join(' ')).toContain('номер дела');
    expect(reasons.join(' ')).toContain('заявитель / осуждённый');
    expect(reasons.join(' ')).toContain('суд, в который подаётся жалоба');
  });

  it('rejects impossible dates before model loading', () => {
    expect(validateCaseInfo({ ...validCase, verdictDate: '31.02.2026' })).toHaveLength(1);
    expect(isValidCourtDate('31.02.2026')).toBe(false);
  });

  it('accepts the supported ISO date format', () => {
    expect(isValidCourtDate('2026-10-01')).toBe(true);
  });
});
