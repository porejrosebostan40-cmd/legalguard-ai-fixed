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
      pipelineTrace.push(trace('01 DOCUMENTS ERROR', 'documents', 'error', 'Судебный материал отсутствует.'));
      return this.emptyResult(runId, pipelineTrace);
    }

    pipelineTrace.push(trace('01 DOCUMENTS OK', 'documents', 'ok', 'Материал принят.'));

    const findings = await this.providers.deepSeek.analyze(documentText);
    pipelineTrace.push(trace('02 ANALYST OK', 'analyst', 'ok', `DeepSeek выявил оснований: ${findings.length}.`));

    const arbiterFindings = await this.providers.chatGPT.arbitrate(documentText, findings);
    pipelineTrace.push(trace('03 ARBITER OK', 'arbiter', 'ok', 'ChatGPT выполнил юридическую оценку оснований.'));

    const accepted = arbiterFindings.filter((finding) => finding.status === 'accepted');
    const strategy: StrategyArgument[] = accepted.map((finding, index) => ({
      findingId: finding.id,
      position: index + 1,
      heading: finding.claim,
      argument: finding.reasoning,
    }));
    pipelineTrace.push(trace('04 STRATEGIST OK', 'strategist', 'ok', `В стратегию принято оснований: ${strategy.length}.`));

    const finalControl = runFinalControl(arbiterFindings, strategy);
    pipelineTrace.push(trace(
      '05 FINAL CONTROL',
      'final-control',
      finalControl.passed ? 'ok' : 'error',
      finalControl.passed ? 'Финальный контроль пройден.' : `Финальный контроль заблокирован: ${finalControl.blockingReasons.join(' ')}`,
    ));

    return {
      runId,
      findings,
      arbiterFindings,
      strategy,
      finalControl,
      finalDocument: finalControl.passed ? this.renderDocument(caseInfo, strategy) : null,
      trace: pipelineTrace,
      readyForSubmission: finalControl.passed,
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
    const body = strategy.map((item) => `${item.position}. ${item.heading}\n${item.argument}`).join('\n\n');
    return `${caseInfo.complaintType.toUpperCase()}\n\nДело: ${caseInfo.caseNumber}\nСуд: ${caseInfo.courtName}\nДата судебного акта: ${caseInfo.verdictDate}\n\n${body}`;
  }
}
