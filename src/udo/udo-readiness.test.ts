import { describe, expect, it } from 'vitest';
import type { UdoIntake } from './udo-readiness';
import { buildUdoReadinessReport, evaluateUdoReadiness } from './udo-readiness';

const completeIntake: UdoIntake = {
  caseNumber: '1-23/2026',
  sentencingCourt: 'Районный суд',
  offenseArticles: 'ст. 000 УК РФ — пример для теста',
  sentenceDescription: 'Лишение свободы на 5 лет — тестовые данные',
  sentenceStartDate: '01.01.2024',
  minimumEligibilityDate: '01.09.2026',
  eligibilityDateVerified: true,
  behaviorSummary: 'Тестовое описание поведения за период отбывания наказания.',
  workStudySummary: 'Тестовые сведения о труде и обучении.',
  rewardsSummary: 'Два поощрения — тестовые данные.',
  sanctionsSummary: 'Взысканий нет — тестовые данные.',
  attitudeToOffense: 'Тестовое описание позиции осуждённого.',
  restitutionSummary: 'Тестовые сведения о возмещении вреда.',
  administrationOpinion: 'supports',
  characterizationStatus: 'available',
  sentenceCopyStatus: 'available',
  restitutionProofStatus: 'available',
  otherMaterials: 'Тестовые документы о семье и работе после освобождения.',
  previousRefusalDate: '',
  repeatPetitionTimingVerified: false,
};

describe('UDO readiness checklist', () => {
  it('does not claim eligibility and marks an empty intake incomplete', () => {
    const empty = Object.fromEntries(Object.keys(completeIntake).map((key) => [key, ''])) as unknown as UdoIntake;
    const result = evaluateUdoReadiness(empty);
    expect(result.completenessStatus).toBe('incomplete');
    expect(result.missingCount).toBeGreaterThan(0);
    expect(result.notice).toContain('не вывод о праве на УДО');
  });

  it('marks a complete set of entered data for human review only', () => {
    const result = evaluateUdoReadiness(completeIntake);
    expect(result.completenessStatus).toBe('complete_for_human_review');
    expect(result.missingCount).toBe(0);
    expect(result.verificationCount).toBe(0);
  });

  it('requires separate verification of the minimum-time calculation', () => {
    const result = evaluateUdoReadiness({ ...completeIntake, eligibilityDateVerified: false });
    expect(result.completenessStatus).toBe('requires_verification');
    expect(result.items.find((item) => item.id === 'eligibility-date')?.status).toBe('needs_verification');
  });

  it('requires a check of repeat-petition timing after a previous refusal', () => {
    const result = evaluateUdoReadiness({ ...completeIntake, previousRefusalDate: '01.02.2026' });
    expect(result.items.find((item) => item.id === 'repeat-timing')?.status).toBe('needs_verification');
    expect(result.completenessStatus).toBe('requires_verification');
  });

  it('exports a checklist report, not a petition or legal conclusion', () => {
    const report = buildUdoReadinessReport(completeIntake, evaluateUdoReadiness(completeIntake));
    expect(report).toContain('НЕ ПРОЦЕССУАЛЬНЫЙ ДОКУМЕНТ');
    expect(report).toContain('КОНТРОЛЬНЫЙ СПИСОК');
    expect(report).toContain('https://publication.pravo.gov.ru/search');
    expect(report).not.toContain('ходатайство подлежит удовлетворению');
  });
});
