import { describe, expect, it } from 'vitest';
import { textReviewProviders } from './text-review.providers';

describe('text review providers', () => {
  it('returns exact source passages found in the supplied document', async () => {
    const document = [
      'Постановление Промышленного районного суда.',
      'Суд приходит к выводу, что оснований для условно-досрочного освобождения не имеется.',
      'В характеристике указано, что осуждённый имеет положительное поведение.',
      'За период отбывания наказания осуждённый имеет 20 поощрений.',
    ].join('\n');

    const findings = await textReviewProviders.analyst.analyze(document);

    expect(findings.length).toBeGreaterThanOrEqual(3);
    for (const finding of findings) {
      expect(finding.sourceQuote).toBeTruthy();
      expect(document).toContain(finding.sourceQuote!);
    }
  });

  it('finds multiple passages for the same scenario instead of stopping at the first match', async () => {
    const document = [
      'Суд приходит к выводу, что оснований для условно-досрочного освобождения не имеется.',
      'Суд не усматривает оснований для условно-досрочного освобождения осуждённого.',
    ].join('\n');

    const findings = await textReviewProviders.analyst.analyze(document);
    const relevant = findings.filter((finding) => finding.claim === 'Судебный вывод об отсутствии оснований для УДО');

    expect(relevant).toHaveLength(2);
    expect(relevant.every((finding) => document.includes(finding.sourceQuote || ''))).toBe(true);
  });

  it('never presents heuristic matches as accepted legal grounds', async () => {
    const document = 'Суд приходит к выводу, что оснований для условно-досрочного освобождения не имеется.';
    const findings = await textReviewProviders.analyst.analyze(document);
    const decisions = await textReviewProviders.arbiter.arbitrate(document, findings);

    expect(decisions.length).toBe(findings.length);
    expect(decisions.every((item) => item.status === 'needs_review')).toBe(true);
    expect(decisions.every((item) => item.legalSignificance === 'none')).toBe(true);
  });

  it('returns no findings when none of the configured text markers occur', async () => {
    const findings = await textReviewProviders.analyst.analyze(
      'Настоящий документ содержит нейтральный текст без указанных тематических формулировок.',
    );
    expect(findings).toEqual([]);
  });

  it('keeps long excerpts exact so source verification can match them', async () => {
    const document = 'В характеристике указано ' + 'дополнительный текст '.repeat(60) + 'осуждённый имеет положительное поведение.';
    const findings = await textReviewProviders.analyst.analyze(document);
    const finding = findings.find((item) => item.claim === 'Упоминание поведения и характеристики осуждённого');

    expect(finding).toBeTruthy();
    expect(finding!.sourceQuote!.length).toBeLessThanOrEqual(650);
    expect(document).toContain(finding!.sourceQuote!);
  });

  it('limits the number of heuristic matches on long documents', async () => {
    const sentence = 'Суд указал, что осуждённый имеет положительную характеристику и 20 поощрений.';
    const findings = await textReviewProviders.analyst.analyze(Array(100).fill(sentence).join('\n'));

    expect(findings.length).toBeLessThanOrEqual(80);
  });
});
