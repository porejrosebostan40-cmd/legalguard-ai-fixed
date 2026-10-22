import type {
  AIProviderSet,
  CaseInfo,
  LegalGuardResult,
  PipelineTraceEntry,
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

export class LegalGuardPipeline {
  constructor(private readonly providers: AIProviderSet) {}

  async run(documentText: string, caseInfo: CaseInfo): Promise<LegalGuardResult> {
    const runId = `LG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const pipelineTrace: PipelineTraceEntry[] = [];

    if (!documentText.trim()) {
      pipelineTrace.push(trace('01 ДОКУМЕНТЫ ОШИБКА', 'documents', 'error', 'Судебный материал отсутствует.'));
      return this.emptyResult(runId, pipelineTrace);
    }

    pipelineTrace.push(trace('01 ДОКУМЕНТЫ OK', 'documents', 'ok', 'Материал принят.'));

    const findings = await this.providers.analyst.analyze(documentText);
    pipelineTrace.push(trace('02 АНАЛИТИК OK', 'analyst', 'ok', `Первичный анализ сформировал оснований: ${findings.length}.`));

    const arbiterFindings = await this.providers.arbiter.arbitrate(documentText, findings);
    pipelineTrace.push(trace('03 АРБИТР OK', 'arbiter', 'ok', 'Арбитр обработал результаты первичного анализа.'));

    const accepted = arbiterFindings.filter((finding) => finding.status === 'accepted');
    const strategy: StrategyArgument[] = accepted.map((finding, index) => ({
      findingId: finding.id,
      position: index + 1,
      heading: finding.claim,
      argument: finding.reasoning,
      sourceQuote: finding.source?.quote || finding.sourceQuote,
      sourceLineStart: finding.source?.startLine,
      sourceLineEnd: finding.source?.endLine,
    }));
    pipelineTrace.push(trace('04 СТРАТЕГИЯ OK', 'strategist', 'ok', `В стратегию принято оснований: ${strategy.length}.`));

    const finalControl = runFinalControl(documentText, findings, arbiterFindings, strategy);
    pipelineTrace.push(trace(
      '05 ФИНАЛЬНЫЙ КОНТРОЛЬ',
      'final-control',
      finalControl.passed ? 'ok' : 'error',
      finalControl.passed ? 'Структурные проверки пройдены; требуется юридическая проверка.' : `Контроль заблокировал результат: ${finalControl.blockingReasons.join(' ')}`,
    ));

    return {
      runId,
      findings,
      arbiterFindings,
      strategy,
      finalControl,
      finalDocument: finalControl.passed ? this.renderDocument(caseInfo, strategy) : null,
      trace: pipelineTrace,
      readyForSubmission: false,
    };
  }

  private emptyResult(runId: string, pipelineTrace: PipelineTraceEntry[]): LegalGuardResult {
    return {
      runId,
      findings: [],
      arbiterFindings: [],
      strategy: [],
      finalControl: null,
      finalDocument: null,
      trace: pipelineTrace,
      readyForSubmission: false,
    };
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
