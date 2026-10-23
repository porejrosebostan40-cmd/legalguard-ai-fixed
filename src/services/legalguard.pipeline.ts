import type {
  AIProviderSet,
  AgentAuditRecord,
  CaseInfo,
  LegalGuardResult,
  PipelineTraceEntry,
  PipelineStage,
  StrategyArgument,
} from '../core/legalguard.types';
import { runFinalControl } from './final-control';

function trace(
  code: string,
  stage: PipelineTraceEntry['stage'],
  status: PipelineTraceEntry['status'],
  message: string,
): PipelineTraceEntry {
  return { code, stage, status, message, timestamp: new Date().toISOString() };
}

function audit(
  id: PipelineStage,
  name: string,
  status: AgentAuditRecord['status'],
  summary: string,
  inputSnapshot: string,
  outputSnapshot: string,
  checks: AgentAuditRecord['checks'] = [],
  beforeText?: string,
  afterText?: string,
  changes: string[] = [],
): AgentAuditRecord {
  return {
    id, name, status, summary, inputSnapshot, outputSnapshot,
    checks, ...(beforeText !== undefined ? { beforeText } : {}),
    ...(afterText !== undefined ? { afterText } : {}),
    changes, timestamp: new Date().toISOString(),
  };
}

function exactQuoteCheck(documentText: string, quote: string | undefined): boolean {
  return Boolean(quote && documentText.includes(quote));
}

export class LegalGuardPipeline {
  constructor(private readonly providers: AIProviderSet) {}

  async run(documentText: string, caseInfo: CaseInfo): Promise<LegalGuardResult> {
    const runId = `LG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const pipelineTrace: PipelineTraceEntry[] = [];
    const agentAudit: AgentAuditRecord[] = [];
    const source = documentText;

    if (!source.trim()) {
      pipelineTrace.push(trace('01 ДОКУМЕНТЫ ОШИБКА', 'documents', 'error', 'Судебный материал отсутствует.'));
      return this.emptyResult(runId, pipelineTrace, [
        audit('documents', 'Документ', 'failed', 'Исходный текст пуст.', source, ''),
        audit('analyst', 'Аналитик', 'skipped', 'Этап не запускался из-за отсутствия документа.', '', ''),
        audit('legal-sources', 'Правовые источники', 'skipped', 'Автоматическая проверка правовых источников пока не подключена.', '', ''),
        audit('arbiter', 'Арбитр', 'skipped', 'Этап не запускался.', '', ''),
        audit('strategist', 'Стратег', 'skipped', 'Этап не запускался.', '', ''),
        audit('stylist', 'Стилист', 'skipped', 'Этап не запускался.', '', ''),
        audit('independent-review', 'Независимая проверка', 'skipped', 'Этап не запускался.', '', ''),
        audit('final-control', 'Финальный контроль', 'failed', 'Контроль невозможен без документа.', '', ''),
      ]);
    }

    agentAudit.push(audit('documents', 'Документ', 'completed', 'Текст передан конвейеру.', source, source, [
      { name: 'Непустой исходный текст', passed: true, detail: `${source.length} символов.` },
    ]));
    pipelineTrace.push(trace('01 ДОКУМЕНТЫ OK', 'documents', 'ok', 'Материал принят.'));

    const findings = await this.providers.analyst.analyze(source);
    const quotesValid = findings.every((finding) => exactQuoteCheck(source, finding.source?.quote || finding.sourceQuote));
    const idsUnique = new Set(findings.map((finding) => finding.id)).size === findings.length;
    const analystPassed = quotesValid && idsUnique && findings.every((finding) => Boolean(finding.id && finding.claim));
    agentAudit.push(audit(
      'analyst', 'Аналитик', analystPassed ? 'completed' : 'warning',
      `Первичный анализ вернул ${findings.length} находок. Это не заключение о наличии нарушения.`,
      source, JSON.stringify(findings, null, 2),
      [
        { name: 'Цитаты подтверждаются исходным текстом', passed: quotesValid, detail: quotesValid ? 'Все предоставленные цитаты являются точными подстроками документа.' : 'Как минимум одна цитата отсутствует в исходном документе.' },
        { name: 'Идентификаторы уникальны', passed: idsUnique, detail: idsUnique ? 'Повторяющихся ID нет.' : 'Обнаружены повторяющиеся ID.' },
      ],
    ));
    pipelineTrace.push(trace('02 АНАЛИТИК', 'analyst', analystPassed ? 'ok' : 'warning', `Первичный анализ сформировал находок: ${findings.length}; цитаты и идентификаторы проверены.`));

    // Legal source retrieval is deliberately reported as unavailable rather than falsely marked successful.
    agentAudit.push(audit('legal-sources', 'Правовые источники', 'skipped',
      'Проверка действующих норм и судебной практики не подключена. Правовые ссылки нельзя считать подтверждёнными этим этапом.',
      JSON.stringify(findings, null, 2), 'Проверка источников не выполнялась.',
      [{ name: 'Доступен верифицированный правовой поиск', passed: false, detail: 'В текущей сборке нет подключённого поискового адаптера с проверяемыми источниками.' }],
    ));

    const arbiterFindings = await this.providers.arbiter.arbitrate(source, findings);
    const knownIds = new Set(findings.map((finding) => finding.id));
    const decisionIds = arbiterFindings.map((finding) => finding.id);
    const decisionsValid = decisionIds.length === knownIds.size
      && new Set(decisionIds).size === decisionIds.length
      && decisionIds.every((id) => knownIds.has(id))
      && findings.every((finding) => decisionIds.includes(finding.id));
    const arbiterQuotesValid = arbiterFindings.every((finding) => exactQuoteCheck(source, finding.source?.quote || finding.sourceQuote));
    const arbiterPassed = decisionsValid && arbiterQuotesValid;
    agentAudit.push(audit('arbiter', 'Арбитр', arbiterPassed ? 'completed' : 'failed',
      `Арбитр вернул ${arbiterFindings.length} решений. Решение модели не считается юридически истинным автоматически.`,
      JSON.stringify(findings, null, 2), JSON.stringify(arbiterFindings, null, 2),
      [
        { name: 'Ровно одно решение на каждую находку', passed: decisionsValid, detail: decisionsValid ? 'ID решений совпадают с ID исходных находок.' : 'Есть пропущенные, неизвестные или повторяющиеся ID.' },
        { name: 'Цитаты остаются в исходном документе', passed: arbiterQuotesValid, detail: arbiterQuotesValid ? 'Цитаты сверены с исходным текстом.' : 'Обнаружена цитата, отсутствующая в исходном документе.' },
      ],
    ));
    pipelineTrace.push(trace('03 АРБИТР', 'arbiter', arbiterPassed ? 'ok' : 'error', arbiterPassed ? 'Решения проверены на соответствие исходным ID и цитатам.' : 'Проверка целостности решений Арбитра не пройдена.'));

    const accepted = arbiterFindings.filter((finding) => finding.status === 'accepted' && knownIds.has(finding.id));
    const strategy: StrategyArgument[] = accepted.map((finding, index) => ({
      findingId: finding.id,
      position: index + 1,
      heading: finding.claim,
      argument: finding.reasoning,
      sourceQuote: finding.source?.quote || finding.sourceQuote,
      sourceLineStart: finding.source?.startLine,
      sourceLineEnd: finding.source?.endLine,
    }));
    agentAudit.push(audit('strategist', 'Стратег', 'completed',
      `Сформирована структура из ${strategy.length} принятых Арбитром находок. Это механическое упорядочивание, не отдельный ИИ-стратег.`,
      JSON.stringify(arbiterFindings, null, 2), JSON.stringify(strategy, null, 2),
      [
        { name: 'В стратегию попали только принятые основания', passed: strategy.every((item) => accepted.some((finding) => finding.id === item.findingId)), detail: 'Проверены ID оснований стратегии.' },
      ],
      JSON.stringify(arbiterFindings, null, 2), JSON.stringify(strategy, null, 2),
      ['Отобраны только находки со статусом accepted.', 'Доводы расположены в порядке поступления; интеллектуальная оценка приоритета не выполнялась.'],
    ));
    pipelineTrace.push(trace('04 СТРАТЕГ', 'strategist', 'ok', `Структурировано оснований: ${strategy.length}. Отдельная стратегическая модель не подключена.`));

    const draftBeforeStylist = this.renderDocument(caseInfo, strategy);
    // This is intentionally a deterministic formatter, not a claim that an AI stylist has run.
    const finalDocument = this.formatDraft(draftBeforeStylist);
    const stylistChanged = finalDocument !== draftBeforeStylist;
    agentAudit.push(audit('stylist', 'Стилист', 'warning',
      'Выполнено только детерминированное форматирование. Отдельный ИИ-стилист в этой сборке не подключён.',
      draftBeforeStylist, finalDocument,
      [
        { name: 'Сохранение всех исходных цитат', passed: strategy.every((item) => !item.sourceQuote || finalDocument.includes(item.sourceQuote)), detail: 'Сверка цитат стратегии с итоговым черновиком.' },
        { name: 'Не добавлять новые правовые ссылки', passed: true, detail: 'Форматировщик не генерирует правовые ссылки.' },
      ],
      draftBeforeStylist, finalDocument,
      stylistChanged ? ['Применено форматирование пробелов и пустых строк.'] : ['Содержательных изменений форматирования не потребовалось.'],
    ));
    pipelineTrace.push(trace('05 СТИЛИСТ', 'stylist', 'warning', 'Только форматирование; ИИ-стилист не подключён.'));

    const quoteIntegrity = strategy.every((item) => !item.sourceQuote || source.includes(item.sourceQuote));
    const acceptedIntegrity = strategy.every((item) => accepted.some((finding) => finding.id === item.findingId));
    const independentPassed = quoteIntegrity && acceptedIntegrity && arbiterPassed;
    agentAudit.push(audit('independent-review', 'Независимая проверка', independentPassed ? 'completed' : 'failed',
      'Автоматическая проверка целостности, а не независимое юридическое заключение.',
      JSON.stringify({ source, strategy, arbiterFindings }, null, 2),
      JSON.stringify({ quoteIntegrity, acceptedIntegrity, arbiterPassed }, null, 2),
      [
        { name: 'Цитаты стратегии существуют в документе', passed: quoteIntegrity, detail: quoteIntegrity ? 'Все цитаты подтверждены исходным текстом.' : 'Найдена неподтверждённая цитата.' },
        { name: 'Нет отклонённых оснований в стратегии', passed: acceptedIntegrity, detail: acceptedIntegrity ? 'Все основания стратегии имеют статус accepted.' : 'Обнаружено основание без подтверждённого принятия.' },
        { name: 'Проверка решений Арбитра пройдена', passed: arbiterPassed, detail: arbiterPassed ? 'Структура решений и цитаты согласованы.' : 'Есть нарушения целостности решений.' },
      ],
    ));
    pipelineTrace.push(trace('06 НЕЗАВИСИМАЯ ПРОВЕРКА', 'independent-review', independentPassed ? 'ok' : 'error', independentPassed ? 'Автоматические проверки целостности пройдены.' : 'Обнаружены ошибки целостности.'));

    const finalControl = runFinalControl(source, findings, arbiterFindings, strategy);
    const controlPassed = finalControl.passed && independentPassed;
    if (!independentPassed) {
      finalControl.blockingReasons.push('Не пройдена независимая автоматическая проверка целостности.');
      finalControl.passed = false;
    }
    agentAudit.push(audit('final-control', 'Финальный контроль', controlPassed ? 'completed' : 'failed',
      controlPassed ? 'Структурные проверки пройдены; юридическая проверка человеком обязательна.' : 'Финальный контроль заблокировал выдачу черновика.',
      JSON.stringify({ findings, arbiterFindings, strategy }, null, 2),
      JSON.stringify(finalControl, null, 2),
      [
        { name: 'Структурные ограничения', passed: controlPassed, detail: controlPassed ? 'Пройдены доступные программные проверки.' : finalControl.blockingReasons.join(' ') },
        { name: 'Юридическая точность подтверждена', passed: false, detail: 'Автоматически не подтверждается; необходима проверка по первоисточникам.' },
      ],
    ));
    pipelineTrace.push(trace('07 ФИНАЛЬНЫЙ КОНТРОЛЬ', 'final-control', controlPassed ? 'ok' : 'error',
      controlPassed ? 'Структурные проверки пройдены; требуется юридическая проверка.' : `Контроль заблокировал результат: ${finalControl.blockingReasons.join(' ')}`,
    ));

    return {
      runId, findings, arbiterFindings, strategy, finalControl,
      finalDocument: controlPassed ? finalDocument : null,
      trace: pipelineTrace, agentAudit, readyForSubmission: false,
    };
  }

  private emptyResult(runId: string, pipelineTrace: PipelineTraceEntry[], agentAudit: AgentAuditRecord[]): LegalGuardResult {
    return {
      runId, findings: [], arbiterFindings: [], strategy: [], finalControl: null,
      finalDocument: null, trace: pipelineTrace, agentAudit, readyForSubmission: false,
    };
  }

  private formatDraft(value: string): string {
    return value
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private renderDocument(caseInfo: CaseInfo, strategy: StrategyArgument[]): string {
    const title = caseInfo.complaintType === 'апелляционная'
      ? 'ЧЕРНОВИК ДОВОДОВ К АПЕЛЛЯЦИОННОЙ ЖАЛОБЕ'
      : 'ЧЕРНОВИК ДОВОДОВ К КАССАЦИОННОЙ ЖАЛОБЕ';
    const body = strategy.map((item) => {
      const quote = item.sourceQuote ? `\nПодтверждающая цитата: «${item.sourceQuote}»` : '\nПодтверждающая цитата: отсутствует — довод требует проверки.';
      const lineRange = item.sourceLineStart !== undefined
        ? `\nСтроки исходного текста: ${item.sourceLineStart}${item.sourceLineEnd !== undefined && item.sourceLineEnd !== item.sourceLineStart ? `–${item.sourceLineEnd}` : ''}`
        : '';
      const relief = item.requestedRelief ? `\nПросительная часть по доводу: ${item.requestedRelief}` : '';
      return `${item.position}. ${item.heading}\n${item.argument}${quote}${lineRange}${relief}`;
    }).join('\n\n');

    return `${title}\n\nДело: ${caseInfo.caseNumber}\nСудебный акт: ${caseInfo.courtName}\nДата акта: ${caseInfo.verdictDate}\n\nОСНОВАНИЯ ЖАЛОБЫ\n\n${body}\n\nПРОСИТЕЛЬНАЯ ЧАСТЬ\n\n[Сформулировать отдельно с учетом обстоятельств дела, вида жалобы и полномочий суда.]\n\nПРИЛОЖЕНИЯ\n\n[Указать документы, подтверждающие доводы и соблюдение процессуальных требований.]\n\nЭто черновик раздела доводов, а не готовая к подаче жалоба. Автоматический контроль не подтверждает юридическую точность. Проверьте факты, цитаты, нормы права, сроки и процессуальную форму.`;
  }
}
