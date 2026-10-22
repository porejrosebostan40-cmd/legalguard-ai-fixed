import type {
  AIProviderSet,
  ArbiterFinding,
  CaseInfo,
  DeepSeekFinding,
  LegalGuardResult,
  PipelineTraceEntry,
  StrategyArgument,
} from '../core/legalguard.types';
import { runFinalControl } from './final-control';
import { validateArbiterCoverage } from './cross-stage-validation';
import { splitDocumentIntoChunks } from './document-chunking';
import { findSourceReference } from './source-attribution';

function trace(
  code: string,
  stage: PipelineTraceEntry['stage'],
  status: PipelineTraceEntry['status'],
  message: string,
): PipelineTraceEntry {
  return { code, stage, status, message, timestamp: new Date().toISOString() };
}

export interface PipelineProgress {
  currentChunk: number;
  totalChunks: number;
  stage: 'analyst' | 'arbiter' | 'chunk-complete' | 'complete';
}

export class LegalGuardPipeline {
  constructor(
    private readonly providers: AIProviderSet,
    private readonly onProgress?: (progress: PipelineProgress) => void,
  ) {}

  async run(documentText: string, caseInfo: CaseInfo): Promise<LegalGuardResult> {
    const runId = `LG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const pipelineTrace: PipelineTraceEntry[] = [];

    if (!documentText.trim()) {
      pipelineTrace.push(trace('01 ДОКУМЕНТЫ ОШИБКА', 'documents', 'error', 'Судебный материал отсутствует.'));
      return this.emptyResult(runId, pipelineTrace);
    }

    const chunks = splitDocumentIntoChunks(documentText);
    if (chunks.length === 0) {
      pipelineTrace.push(trace('01 ДОКУМЕНТЫ ОШИБКА', 'documents', 'error', 'После нормализации в документе не осталось текста.'));
      return this.emptyResult(runId, pipelineTrace);
    }
    pipelineTrace.push(trace('01 ДОКУМЕНТЫ OK', 'documents', 'ok', `Материал разделён на ${chunks.length} фрагментов для обработки в ограниченном контексте модели.`));

    const findings: DeepSeekFinding[] = [];
    const arbiterFindings: ArbiterFinding[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      this.onProgress?.({ currentChunk: index + 1, totalChunks: chunks.length, stage: 'analyst' });
      const chunkFindings = await this.providers.deepSeek.analyze(chunks[index]);
      const namespacedFindings = chunkFindings.map((finding) => ({
        ...finding,
        id: `C${index + 1}-${finding.id}`,
      }));
      findings.push(...namespacedFindings);

      if (namespacedFindings.length === 0) {
        this.onProgress?.({ currentChunk: index + 1, totalChunks: chunks.length, stage: 'chunk-complete' });
        continue;
      }
      this.onProgress?.({ currentChunk: index + 1, totalChunks: chunks.length, stage: 'arbiter' });
      const rawArbiterFindings = await this.providers.chatGPT.arbitrate(chunks[index], namespacedFindings);
      const coveredFindings = validateArbiterCoverage(namespacedFindings, rawArbiterFindings);
      arbiterFindings.push(...coveredFindings.map((finding) => ({
        ...finding,
        source: findSourceReference(documentText, finding.sourceQuote ?? ''),
      })));
      this.onProgress?.({ currentChunk: index + 1, totalChunks: chunks.length, stage: 'chunk-complete' });
    }

    this.onProgress?.({ currentChunk: chunks.length, totalChunks: chunks.length, stage: 'complete' });

    pipelineTrace.push(trace(
      '02 АНАЛИЗ ЗАВЕРШЁН',
      'analyst',
      findings.length ? 'ok' : 'warning',
      findings.length
        ? `Обработано фрагментов: ${chunks.length}; получено кандидатов на проверку: ${findings.length}. Каждый требует подтверждения источником.`
        : `Обработано фрагментов: ${chunks.length}. Провайдер не выявил кандидатов. Это не подтверждает отсутствие нарушений.`,
    ));

    pipelineTrace.push(trace(
      '03 ПРАВОВАЯ ОЦЕНКА',
      'arbiter',
      arbiterFindings.length ? 'ok' : 'warning',
      `Оценено оснований: ${arbiterFindings.length}. Локальный режим использует три последовательных роли на одной модели, а не независимые системы. Автоматическая оценка не заменяет проверку юристом.`,
    ));

    const accepted = arbiterFindings.filter((finding) => finding.status === 'accepted');
    const strategy: StrategyArgument[] = accepted.map((finding, index) => ({
      findingId: finding.id,
      position: index + 1,
      heading: finding.claim,
      argument: finding.reasoning,
      source: finding.source,
      legalBasis: finding.legalBasis ?? [],
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
      ? 'ПРОЕКТ АПЕЛЛЯЦИОННОЙ ЖАЛОБЫ — ЧЕРНОВИК'
      : 'ПРОЕКТ КАССАЦИОННОЙ ЖАЛОБЫ — ЧЕРНОВИК';
    const body = strategy.map((item) => {
      const sourceCitation = item.source
        ? `\nЦитата из материала (файл: ${item.source.documentId}): «${item.source.quote}»`
        : '\nИсточник цитаты не установлен автоматически; требуется ручная сверка исходного материала.';
      const basis = item.legalBasis?.length
        ? `\nПредполагаемая правовая основа (НЕ ПРОВЕРЕНА): ${item.legalBasis.join('; ')}. Проверьте официальный источник и редакцию на юридически значимую дату.`
        : '\nПравовая основа не указана; довод требует отдельной юридической проверки.';
      const relief = item.requestedRelief ? `\nПросительная часть по доводу: ${item.requestedRelief}` : '';
      return `${item.position}. ${item.heading}\n${item.argument}${sourceCitation}${basis}${relief}`;
    }).join('\n\n');

    return `${title}\n\nВ суд: ${caseInfo.recipientCourtName}\nЗаявитель / осуждённый: ${caseInfo.clientName}\nНомер дела: ${caseInfo.caseNumber}\nСуд, вынесший обжалуемый акт: ${caseInfo.courtName}\nДата акта: ${caseInfo.verdictDate}\n\nОСНОВАНИЯ ЖАЛОБЫ (ПРОЕКТ)\n\n${body}\n\nПРОСИТЕЛЬНАЯ ЧАСТЬ — НЕ СФОРМИРОВАНА\nСформулируйте конкретное требование после проверки применимых норм, стадии процесса и полномочий суда. Не используйте общую формулировку без юридической проверки.\n\nДАННЫЕ, КОТОРЫЕ НУЖНО ДОПОЛНИТЬ\n- Процессуальное положение заявителя и сведения о представителе (если есть).\n- Адрес для корреспонденции и контактные данные, если они требуются для данного вида жалобы.\n- Дата получения копии судебного акта и сведения, необходимые для проверки срока обжалования.\n- Перечень приложений и подтверждение направления копий участникам, если это требуется законом.\n- Дата составления и подпись.\n\nИСТОЧНИКИ ДЛЯ РУЧНОЙ ПРОВЕРКИ ПРАВОВЫХ ССЫЛОК\nОфициальный интернет-портал правовой информации: https://pravo.gov.ru/\nПоиск официального опубликования: https://publication.pravo.gov.ru/search\nПортал Минюста России «Нормативные правовые акты в Российской Федерации»: https://pravo.minjust.ru/\n\nПРОЕКТ СФОРМИРОВАН LegalGuard AI. Это не готовый процессуальный документ. Проверьте факты, каждую цитату, правовые ссылки и редакции норм на юридически значимую дату, процессуальные требования, сроки, подсудность и просительную часть. Автоматический контроль не подтверждает готовность к подаче.`;
  }
}
