import type { CaseInfo } from '../core/legalguard.types';

export function isValidCourtDate(value: string): boolean {
  let year: number;
  let month: number;
  let day: number;
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validateCaseInfo(caseInfo?: CaseInfo): string[] {
  if (!caseInfo) return [];
  const reasons: string[] = [];
  const requiredFields: Array<[string, string]> = [
    ['номер дела', caseInfo.caseNumber],
    ['суд, в который подаётся жалоба', caseInfo.recipientCourtName],
    ['заявитель / осуждённый', caseInfo.clientName],
    ['наименование суда, вынесшего акт', caseInfo.courtName],
    ['дата судебного акта', caseInfo.verdictDate],
  ];
  for (const [label, value] of requiredFields) {
    if (typeof value !== 'string' || !value.trim() || value.trim() === '—') {
      reasons.push(`Не заполнено обязательное поле: ${label}.`);
    } else if (label === 'дата судебного акта' && !isValidCourtDate(value.trim())) {
      reasons.push('Дата судебного акта должна быть календарно корректной и иметь формат ДД.ММ.ГГГГ или ГГГГ-ММ-ДД.');
    }
  }
  return reasons;
}
