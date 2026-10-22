export type UdoOpinion = 'supports' | 'opposes' | 'unknown';
export type UdoDocumentStatus = 'available' | 'requested' | 'missing' | 'unknown';

export interface UdoIntake {
  caseNumber: string;
  sentencingCourt: string;
  offenseArticles: string;
  sentenceDescription: string;
  sentenceStartDate: string;
  minimumEligibilityDate: string;
  eligibilityDateVerified: boolean;
  behaviorSummary: string;
  workStudySummary: string;
  rewardsSummary: string;
  sanctionsSummary: string;
  attitudeToOffense: string;
  restitutionSummary: string;
  administrationOpinion: UdoOpinion;
  characterizationStatus: UdoDocumentStatus;
  sentenceCopyStatus: UdoDocumentStatus;
  restitutionProofStatus: UdoDocumentStatus;
  otherMaterials: string;
  previousRefusalDate: string;
  repeatPetitionTimingVerified: boolean;
}

export type UdoChecklistStatus = 'provided' | 'missing' | 'needs_verification';

export interface UdoChecklistItem {
  id: string;
  title: string;
  status: UdoChecklistStatus;
  guidance: string;
  legalReference: string;
}

export interface UdoReadinessResult {
  completenessStatus: 'incomplete' | 'requires_verification' | 'complete_for_human_review';
  items: UdoChecklistItem[];
  missingCount: number;
  verificationCount: number;
  notice: string;
}

function filled(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() !== '—';
}

function item(
  id: string,
  title: string,
  status: UdoChecklistStatus,
  guidance: string,
  legalReference: string,
): UdoChecklistItem {
  return { id, title, status, guidance, legalReference };
}

/**
 * This is a document-completeness checklist, not an eligibility calculator.
 * Time thresholds and the applicable edition of the law must be verified separately.
 */
export function evaluateUdoReadiness(input: UdoIntake): UdoReadinessResult {
  const items: UdoChecklistItem[] = [
    item('case-number', 'Номер материала / дела', filled(input.caseNumber) ? 'provided' : 'missing', 'Сверьте номер с судебными документами.', 'Реквизиты материала'),
    item('court', 'Суд, которому адресуется ходатайство', filled(input.sentencingCourt) ? 'provided' : 'missing', 'Проверьте территориальную подсудность и точное наименование суда.', 'Процессуальные правила требуют отдельной проверки'),
    item('offense', 'Статья или статьи осуждения', filled(input.offenseArticles) ? 'provided' : 'missing', 'Укажите все статьи, части и пункты приговора; по ним отдельно проверяется применимый минимальный срок.', 'Статья 79 УК РФ'),
    item('sentence', 'Назначенное наказание и срок', filled(input.sentenceDescription) ? 'provided' : 'missing', 'Сверьте окончательное наказание с последующими судебными актами, если они были.', 'Статья 79 УК РФ'),
    item('start-date', 'Начало исчисления срока', filled(input.sentenceStartDate) ? 'provided' : 'missing', 'Проверьте зачёт предварительного содержания, пересчёты и изменения приговора.', 'Статья 79 УК РФ; расчёт требует проверки по материалам'),
    item('eligibility-date', 'Предполагаемая дата достижения минимального срока', filled(input.minimumEligibilityDate) ? (input.eligibilityDateVerified ? 'provided' : 'needs_verification') : 'missing', 'Не вычисляется приложением. Проверьте применимую долю срока, специальные правила и зачёты по актуальной редакции закона.', 'Статья 79 УК РФ'),
    item('behavior', 'Поведение за весь период отбывания наказания', filled(input.behaviorSummary) ? 'provided' : 'missing', 'Опишите подтверждённые сведения и приложите документы, на которые ссылаетесь.', 'Часть 4.1 статьи 79 УК РФ'),
    item('work-study', 'Отношение к труду и обучению', filled(input.workStudySummary) ? 'provided' : 'missing', 'Укажите периоды работы/обучения, результаты и подтверждающие документы; не заменяйте факты общими оценками.', 'Часть 4.1 статьи 79 УК РФ; часть 2 статьи 175 УИК РФ'),
    item('rewards', 'Поощрения', filled(input.rewardsSummary) ? 'provided' : 'missing', 'Перечислите даты, основания и подтверждение каждого поощрения.', 'Часть 4.1 статьи 79 УК РФ'),
    item('sanctions', 'Взыскания и сведения об их статусе', filled(input.sanctionsSummary) ? 'provided' : 'missing', 'Укажите все взыскания, даты, отмену/снятие и документы. Не скрывайте неблагоприятные сведения.', 'Часть 4.1 статьи 79 УК РФ'),
    item('attitude', 'Отношение к совершенному деянию', filled(input.attitudeToOffense) ? 'provided' : 'missing', 'Изложите позицию осуждённого правдиво и конкретно; не подменяйте её формальными фразами.', 'Статья 175 УИК РФ; часть 4.1 статьи 79 УК РФ'),
    item('restitution', 'Возмещение вреда или иное заглаживание вреда', filled(input.restitutionSummary) ? 'provided' : 'missing', 'Укажите присуждённую сумму, фактически выплаченное, остаток и объективные причины невозможности полного возмещения, если применимо.', 'Статья 79 УК РФ; статья 175 УИК РФ'),
    item('administration', 'Позиция администрации учреждения', input.administrationOpinion !== 'unknown' ? 'provided' : 'missing', 'Зафиксируйте содержание заключения администрации; позиция сама по себе не предрешает решение суда.', 'Часть 4.1 статьи 79 УК РФ; часть 2 статьи 175 УИК РФ'),
    item('characteristic', 'Характеристика учреждения', input.characterizationStatus === 'available' ? 'provided' : input.characterizationStatus === 'requested' ? 'needs_verification' : 'missing', 'Если характеристика запрошена, проверьте её получение и актуальность к судебному заседанию.', 'Часть 2 статьи 175 УИК РФ'),
    item('sentence-copy', 'Копия приговора и последующих судебных актов', input.sentenceCopyStatus === 'available' ? 'provided' : input.sentenceCopyStatus === 'requested' ? 'needs_verification' : 'missing', 'Соберите полный комплект актов, влияющих на наказание и исчисление срока.', 'Проверка исходных документов'),
    item('restitution-proof', 'Подтверждение возмещения вреда', input.restitutionProofStatus === 'available' ? 'provided' : input.restitutionProofStatus === 'requested' ? 'needs_verification' : 'missing', 'Подготовьте платёжные документы, расписки или иные подтверждения, если они существуют.', 'Статья 79 УК РФ; статья 175 УИК РФ'),
    item('other-materials', 'Иные материалы об исправлении', filled(input.otherMaterials) ? 'provided' : 'missing', 'При наличии укажите и подтвердите сведения о поддержке семьи, жилье, работе после освобождения, обучении и иных значимых обстоятельствах.', 'Статья 175 УИК РФ'),
    item('repeat-timing', 'Проверка срока повторного обращения после отказа', !filled(input.previousRefusalDate) ? 'provided' : input.repeatPetitionTimingVerified ? 'provided' : 'needs_verification', 'Если ранее был отказ, проверьте дату постановления и допустимость повторного обращения по актуальной редакции закона.', 'Часть 10 статьи 175 УИК РФ'),
  ];

  const missingCount = items.filter((entry) => entry.status === 'missing').length;
  const verificationCount = items.filter((entry) => entry.status === 'needs_verification').length;
  const completenessStatus = missingCount > 0
    ? 'incomplete'
    : verificationCount > 0
      ? 'requires_verification'
      : 'complete_for_human_review';

  return {
    completenessStatus,
    items,
    missingCount,
    verificationCount,
    notice: 'Это проверка полноты введённых сведений, а не вывод о праве на УДО и не прогноз решения суда. Приложение не вычисляет минимальную долю срока, не проверяет редакцию закона и не оценивает вероятность освобождения. Все правовые ссылки и даты должны быть сверены по официальным источникам и материалам дела.',
  };
}

export function buildUdoReadinessReport(input: UdoIntake, result: UdoReadinessResult): string {
  const statusLabel = result.completenessStatus === 'incomplete'
    ? 'НЕ ВСЕ СВЕДЕНИЯ ВНЕСЕНЫ'
    : result.completenessStatus === 'requires_verification'
      ? 'ТРЕБУЕТСЯ ПРОВЕРКА'
      : 'СВЕДЕНИЯ СОБРАНЫ ДЛЯ ПРОВЕРКИ ЧЕЛОВЕКОМ';
  const fields = [
    ['Номер материала / дела', input.caseNumber],
    ['Суд', input.sentencingCourt],
    ['Статья или статьи осуждения', input.offenseArticles],
    ['Назначенное наказание', input.sentenceDescription],
    ['Начало исчисления срока', input.sentenceStartDate],
    ['Предполагаемая дата достижения минимального срока', input.minimumEligibilityDate],
  ];
  const details = fields.map(([label, value]) => `${label}: ${filled(value) ? value : 'НЕ УКАЗАНО'}`).join('\n');
  const checklist = result.items.map((entry, index) => {
    const state = entry.status === 'provided' ? 'ВНЕСЕНО' : entry.status === 'missing' ? 'НЕ ХВАТАЕТ' : 'ПРОВЕРИТЬ';
    return `${index + 1}. [${state}] ${entry.title}\n   Что проверить: ${entry.guidance}\n   Правовая ссылка для сверки: ${entry.legalReference}`;
  }).join('\n\n');
  return `ПОДГОТОВКА МАТЕРИАЛОВ К ХОДАТАЙСТВУ ОБ УДО — НЕ ПРОЦЕССУАЛЬНЫЙ ДОКУМЕНТ\n\nСтатус полноты: ${statusLabel}\nНе заполнено: ${result.missingCount}; требуется отдельная проверка: ${result.verificationCount}.\n\nСВЕДЕНИЯ ДЕЛА\n${details}\n\nКОНТРОЛЬНЫЙ СПИСОК\n\n${checklist}\n\nВАЖНО\n${result.notice}\n\nОфициальные источники для ручной проверки:\nhttps://pravo.gov.ru/\nhttps://publication.pravo.gov.ru/search\nhttps://pravo.minjust.ru/\n\nПодготовлено LegalGuard AI. Это не ходатайство, не юридическое заключение и не подтверждение соблюдения срока для УДО.`;
}
