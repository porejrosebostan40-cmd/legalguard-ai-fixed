import { useState } from 'react';
import type { UdoDocumentStatus, UdoIntake, UdoOpinion, UdoRestitutionProofStatus } from './udo-readiness';
import { buildUdoReadinessReport, evaluateUdoReadiness } from './udo-readiness';

const emptyIntake: UdoIntake = {
  caseNumber: '',
  sentencingCourt: '',
  offenseArticles: '',
  sentenceDescription: '',
  sentenceStartDate: '',
  sentenceStartDateVerified: false,
  minimumEligibilityDate: '',
  eligibilityDateVerified: false,
  behaviorSummary: '',
  workStudySummary: '',
  rewardsSummary: '',
  sanctionsSummary: '',
  attitudeToOffense: '',
  restitutionSummary: '',
  administrationOpinion: 'unknown',
  characterizationStatus: 'unknown',
  sentenceCopyStatus: 'unknown',
  restitutionProofStatus: 'unknown',
  otherMaterials: '',
  previousRefusalDate: '',
  repeatPetitionTimingVerified: false,
};

const documentStatusLabels: Record<UdoDocumentStatus, string> = {
  available: 'Есть на руках',
  requested: 'Запрошен, ожидается',
  missing: 'Отсутствует',
  unknown: 'Не знаю',
};

export function UdoReadiness() {
  const [input, setInput] = useState<UdoIntake>(emptyIntake);
  const result = evaluateUdoReadiness(input);

  function update<K extends keyof UdoIntake>(key: K, value: UdoIntake[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function downloadReport() {
    try {
      const report = buildUdoReadinessReport(input, result);
      const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LegalGuard-UDO-${input.caseNumber.trim().replace(/[^0-9a-zа-яё._-]+/giu, '_') || 'checklist'}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // The browser may block downloads; the on-screen checklist remains available.
    }
  }

  return (
    <section className="panel udo-panel">
      <h2>Подготовка материалов к УДО</h2>
      <p className="control-warning">Это отдельный контрольный список по полноте сведений. Он не рассчитывает право на УДО, не определяет применимую долю срока, не предсказывает решение суда и не создаёт ходатайство. Сначала сверьте срок и редакцию закона по официальным источникам.</p>

      <div className="fields udo-fields">
        <label>Номер материала / дела<input value={input.caseNumber} onChange={(event) => update('caseNumber', event.target.value)} placeholder="Номер дела" /></label>
        <label>Суд, которому адресуется ходатайство<input value={input.sentencingCourt} onChange={(event) => update('sentencingCourt', event.target.value)} placeholder="Точное наименование суда" /></label>
        <label>Статья / статьи приговора<input value={input.offenseArticles} onChange={(event) => update('offenseArticles', event.target.value)} placeholder="Статья, часть, пункт" /></label>
        <label>Назначенное наказание и срок<input value={input.sentenceDescription} onChange={(event) => update('sentenceDescription', event.target.value)} placeholder="Вид наказания и срок" /></label>
        <label>Дата начала исчисления срока<input value={input.sentenceStartDate} onChange={(event) => update('sentenceStartDate', event.target.value)} placeholder="ДД.ММ.ГГГГ" /></label>
        <label>Предполагаемая дата достижения минимального срока<input value={input.minimumEligibilityDate} onChange={(event) => update('minimumEligibilityDate', event.target.value)} placeholder="ДД.ММ.ГГГГ — только после расчёта" /></label>
      </div>
      <label className="udo-confirm"><input type="checkbox" checked={input.sentenceStartDateVerified} onChange={(event) => update('sentenceStartDateVerified', event.target.checked)} />Я сверил дату начала исчисления срока с приговором, зачётами и последующими судебными актами.</label>
      <label className="udo-confirm"><input type="checkbox" checked={input.eligibilityDateVerified} onChange={(event) => update('eligibilityDateVerified', event.target.checked)} />Я отдельно проверил расчёт минимального срока, применимую норму и зачёты по документам дела.</label>

      <div className="udo-fields">
        <label>Поведение за весь период отбывания<textarea value={input.behaviorSummary} onChange={(event) => update('behaviorSummary', event.target.value)} placeholder="Только проверяемые сведения и даты" /></label>
        <label>Отношение к труду и обучению<textarea value={input.workStudySummary} onChange={(event) => update('workStudySummary', event.target.value)} /></label>
        <label>Поощрения<textarea value={input.rewardsSummary} onChange={(event) => update('rewardsSummary', event.target.value)} placeholder="Количество, даты, основания" /></label>
        <label>Взыскания и их статус<textarea value={input.sanctionsSummary} onChange={(event) => update('sanctionsSummary', event.target.value)} placeholder="Укажите также снятые или погашенные взыскания" /></label>
        <label>Отношение к совершенному деянию<textarea value={input.attitudeToOffense} onChange={(event) => update('attitudeToOffense', event.target.value)} /></label>
        <label>Возмещение вреда / исполнение гражданского иска<textarea value={input.restitutionSummary} onChange={(event) => update('restitutionSummary', event.target.value)} placeholder="Присуждённая сумма, выплаченное, остаток, документы" /></label>
        <label>Заключение администрации<select value={input.administrationOpinion} onChange={(event) => update('administrationOpinion', event.target.value as UdoOpinion)}><option value="unknown">Неизвестно / нет заключения</option><option value="supports">Поддерживает</option><option value="opposes">Не поддерживает</option></select></label>
        <label>Характеристика учреждения<select value={input.characterizationStatus} onChange={(event) => update('characterizationStatus', event.target.value as UdoDocumentStatus)}>{Object.entries(documentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Копия приговора и последующих актов<select value={input.sentenceCopyStatus} onChange={(event) => update('sentenceCopyStatus', event.target.value as UdoDocumentStatus)}>{Object.entries(documentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Подтверждения возмещения вреда<select value={input.restitutionProofStatus} onChange={(event) => update('restitutionProofStatus', event.target.value as UdoRestitutionProofStatus)}><option value="unknown">Не знаю</option><option value="available">Есть на руках</option><option value="requested">Запрошены, ожидаются</option><option value="missing">Отсутствуют</option><option value="not_applicable">Не применимо — объяснить в поле о возмещении</option></select></label>
        <label>Иные материалы об исправлении<textarea value={input.otherMaterials} onChange={(event) => update('otherMaterials', event.target.value)} placeholder="Например, документы о семье, жилье, обучении или работе после освобождения" /></label>
        <label>Дата предыдущего отказа суда, если был<input value={input.previousRefusalDate} onChange={(event) => update('previousRefusalDate', event.target.value)} placeholder="ДД.ММ.ГГГГ или оставьте пустым" /></label>
      </div>
      {input.previousRefusalDate.trim() && <label className="udo-confirm"><input type="checkbox" checked={input.repeatPetitionTimingVerified} onChange={(event) => update('repeatPetitionTimingVerified', event.target.checked)} />Я проверил срок повторного обращения по действующей редакции закона и постановлению об отказе.</label>}

      <div className="udo-summary">
        <h3>Полнота сведений</h3>
        <p>{result.completenessStatus === 'incomplete' ? 'Не все сведения внесены.' : result.completenessStatus === 'requires_verification' ? 'Сведения внесены, но отдельные пункты требуют проверки.' : 'Сведения собраны для проверки человеком.'}</p>
        <p>Не заполнено: {result.missingCount}. Требует проверки: {result.verificationCount}.</p>
        <p className="control-warning">{result.notice}</p>
      </div>

      <div className="udo-checklist">
        {result.items.map((entry) => (
          <div className="udo-check-item" key={entry.id}>
            <strong>{entry.status === 'provided' ? 'ВНЕСЕНО' : entry.status === 'missing' ? 'НЕ ХВАТАЕТ' : 'ПРОВЕРИТЬ'} — {entry.title}</strong>
            <p>{entry.guidance}</p>
            <small>Правовая ссылка для сверки: {entry.legalReference}</small>
          </div>
        ))}
      </div>

      <div className="udo-actions">
        <button type="button" onClick={downloadReport}>Скачать контрольный список TXT</button>
        <button type="button" className="secondary-button" onClick={() => setInput(emptyIntake)}>Очистить форму</button>
      </div>
      <div className="source-links">
        <a href="https://pravo.gov.ru/" target="_blank" rel="noreferrer">Официальный портал правовой информации</a>
        <a href="https://publication.pravo.gov.ru/search" target="_blank" rel="noreferrer">Поиск официальных публикаций</a>
        <a href="https://pravo.minjust.ru/" target="_blank" rel="noreferrer">Портал НПА Минюста</a>
      </div>
    </section>
  );
}
