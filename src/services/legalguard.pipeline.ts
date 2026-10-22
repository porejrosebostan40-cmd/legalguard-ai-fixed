import type {
  AIProviderSet,
  CaseInfo,
  LegalGuardResult,
  PipelineTraceEntry,
  StrategyArgument,
} from '../core/legalguard.types';
import { runFinalControl } from './final-control';
import { validateArbiterCoverage } from './cross-stage-validation';

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

    const findings = await this.providers.deepSeek.analyze(documentText);
    pipelineTrace.push(trace(
      '02 АНАЛИЗ ЗАВЕРШЁН',
      'analyst',
      findings.length ? 'ok' : 'warning',
      findings.length
        ? `Получено кандидатов на проверку: ${findings.length}. Каждый требует подтверждения источником.`
        : 'Провайдер не выявил кандидатов. Это не подтверждает отсутствие нарушений.',
    ));

    const rawArbiterFindings = await this.providers.chatGPT.arbitrate(documentText, findings);
    const arbiterFindings = validateArbiterCoverage(findings, rawArbiterFindings);
    pipelineTrace.push(trace(
      '03 ПРАВОВАЯ ОЦЕНКА',
      'arbiter',
      arbiterFindings.length ? 'ok' : 'warning',
      `Оценено оснований: ${arbiterFindings.length}. Локальный режим использует три последовательных роли: аналитик, арбитр и критик. Автоматическая оценка не заменяет проверку юристом.`,
    ));

    const accepted = arbiterFindings.filter((finding) => finding.status === 'accepted');
    const strategy: StrategyArgument[] = accepted.map((finding, index) => ({
      findingId: finding.id,
      position: index + 1,
      heading: finding.claim,
      argument: finding.reasoning,
      legalBasis: finding.legalBasis ?? [],
      requestedRelief: `Проверить довод в пределах ${caseInfo.complaintType} жалобы.`,
    }));
    pipelineTrace.push(trace('04 ПРОЕКТ СТРАТЕГИИ', 'strategist', strategy.length ? 'ok' : 'warning', `В проект стратегии включено оснований: ${strategy.length}.`));

    const finalControl = runFinalControl(documentText, arbiterFindings, strategy, caseInfo);
    pipelineTrace.push(trace(
      '05 ФИНАЛЬНЫЙ КОНТРОЛЬ',
      'final-control',
      finalControl.passed ? 'ok' : 'error',
      finalControl.passed
        ? 'Формальные проверки пройдены. Проект всё равно требует проверки человеком.'
        : `Формирование проекта заблокировано: ${finalControl.blockingReasons.join(' ')}`,
    ));

    return {
      runId,
      findings,
      arbiterFindings,
      strategy,
      finalControl,
      finalDocument: finalControl.passed ? this.renderDocument(caseInfo, strategy) : null,
      trace: pipelineTrace,
      // A generated draft must never be represented as ready for court filing.
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
      ? 'АПЕЛЛЯЦИОННАЯ ЖАЛОБА'
      : 'КАССАЦИОННАЯ ЖАЛОБА';
    const body = strategy.map((item) => {
      const basis = item.legalBasis?.length
        ? `\nПредполагаемая правовая основа (НЕ ПРОВЕРЕНА): ${item.legalBasis.join('; ')}. Проверьте официальный источник и редакцию на юридически значимую дату.`
        : '\nПравовая основа не указана; довод требует отдельной юридической проверки.';
      const relief = item.requestedRelief ? `\nПросительная часть по доводу: ${item.requestedRelief}` : '';
      return `${item.position}. ${item.heading}\n${item.argument}${basis}${relief}`;
    }).join('\n\n');

    return `${title}\n\nДело: ${caseInfo.caseNumber}\nСудебный акт: ${caseInfo.courtName}\nДата акта: ${caseInfo.verdictDate}\n\nОСНОВАНИЯ ЖАЛОБЫ\n\n${body}\n\nПРОЕКТ СФОРМИРОВАН LegalGuard AI. Перед использованием необходимо проверить факты, правовые ссылки, процессуальные требования и сроки; автоматический контроль не подтверждает готовность к подаче.`;
  }
}
