import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LegalGuardPipeline } from './services/legalguard.pipeline';
import { mockProviders } from './providers/mock.providers';
import { combineDocuments, readTextDocument, validateDocumentBatch } from './services/document-ingestion';
import { DOCUMENT_ROLE_LABELS, type DocumentInput, type DocumentRole } from './services/document-ingestion';
import type { ComplaintType, LegalGuardResult } from './core/legalguard.types';
import { areAllFindingsReviewed } from './services/manual-review';
import { validateCaseInfo } from './services/case-info-validation';
import './styles.css';

function App() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentInput[]>([]);
  const [caseNumber, setCaseNumber] = useState('');
  const [recipientCourtName, setRecipientCourtName] = useState('');
  const [clientName, setClientName] = useState('');
  const [courtName, setCourtName] = useState('');
  const [verdictDate, setVerdictDate] = useState('');
  const [complaintType, setComplaintType] = useState<ComplaintType>('кассационная');
  const [providerMode, setProviderMode] = useState<'test' | 'local'>('test');
  const [result, setResult] = useState<LegalGuardResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [modelProgress, setModelProgress] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [manuallyReviewedFindingIds, setManuallyReviewedFindingIds] = useState<string[]>([]);
  const allFindingIds = result?.arbiterFindings.map((finding) => finding.id) ?? [];
  const allFindingsReviewed = areAllFindingsReviewed(result?.arbiterFindings ?? [], manuallyReviewedFindingIds);

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string; progress: number }>).detail;
      setModelProgress(detail ? `${detail.text} (${Math.round(detail.progress * 100)}%)` : null);
    };
    window.addEventListener('legalguard:model-progress', handleProgress);
    return () => window.removeEventListener('legalguard:model-progress', handleProgress);
  }, []);

  function invalidateResult() {
    setResult(null);
    setCopied(false);
    setManuallyReviewedFindingIds([]);
    setAnalysisProgress(null);
  }

  async function loadFiles(files: File[]) {
    if (files.length === 0) return;
    invalidateResult();
    setText('');
    setFileName(null);
    setDocuments([]);
    setError(null);
    try {
      validateDocumentBatch(files);
      const loadedDocuments: DocumentInput[] = [];
      // Sequential parsing avoids loading several large PDF workers into memory at once.
      for (const file of files) loadedDocuments.push(await readTextDocument(file));
      const combinedText = combineDocuments(loadedDocuments);
      setDocuments(loadedDocuments);
      setText(combinedText);
      setFileName(loadedDocuments.map((document) => document.name).join(', '));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось прочитать документы.');
    }
  }

  function updateDocumentRole(index: number, role: DocumentRole | undefined) {
    const updated = documents.map((document, currentIndex) =>
      currentIndex === index ? { ...document, role } : document,
    );
    try {
      const combinedText = combineDocuments(updated);
      setDocuments(updated);
      setText(combinedText);
      setError(null);
      invalidateResult();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить метки документов.');
    }
  }

  async function run() {
    const caseInfo = {
      caseNumber: caseNumber || '—',
      recipientCourtName: recipientCourtName || '—',
      clientName: clientName || '—',
      courtName: courtName || '—',
      verdictDate: verdictDate || '—',
      complaintType,
    };
    const metadataErrors = validateCaseInfo(caseInfo);
    if (!text.trim() || metadataErrors.length > 0) {
      setResult(null);
      setManuallyReviewedFindingIds([]);
      setCopied(false);
      setAnalysisProgress(null);
      setError(!text.trim() ? 'Добавьте текст судебного материала перед запуском анализа.' : metadataErrors.join(' '));
      return;
    }

    setRunning(true);
    setError(null);
    setCopied(false);
    setResult(null);
    setManuallyReviewedFindingIds([]);
    setAnalysisProgress('Подготовка материала к анализу…');
    try {
      const providers = providerMode === 'test'
        ? mockProviders
        : (await import('./providers/local.providers')).localProviders;
      const pipeline = new LegalGuardPipeline(providers, ({ currentChunk, totalChunks, stage }) => {
        const stageLabel = stage === 'analyst'
          ? 'Анализ фрагмента'
          : stage === 'arbiter'
            ? 'Проверка фрагмента арбитром'
            : stage === 'chunk-complete'
              ? 'Фрагмент обработан'
              : 'Анализ фрагментов завершён';
        setAnalysisProgress(`${stageLabel}: ${currentChunk} из ${totalChunks}`);
      });
      const next = await pipeline.run(text, caseInfo);
      setResult(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка провайдера.');
      setResult(null);
      setManuallyReviewedFindingIds([]);
    } finally {
      setRunning(false);
    }
  }

  async function selfTestLocalModel() {
    setRunning(true);
    setError(null);
    setDiagnosticMessage('Проверка WebGPU, загрузки модели и генерации JSON…');
    try {
      const diagnostics = await import('./providers/local.providers');
      const result = await diagnostics.runLocalModelSelfTest();
      setDiagnosticMessage(`Самопроверка пройдена: ${result.modelId}. Это подтверждает запуск модели и JSON-режима, но не юридическую точность.`);
    } catch (cause) {
      setDiagnosticMessage('Самопроверка локальной модели не пройдена.');
      setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка локальной модели.');
    } finally {
      setRunning(false);
    }
  }

  function downloadDocument() {
    if (!result?.finalDocument || !allFindingsReviewed || !result.finalControl?.passed) return;
    try {
      const blob = new Blob([result.finalDocument], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeCaseNumber = caseNumber.trim().replace(/[^0-9a-zа-яё._-]+/giu, '_') || 'draft';
      link.href = url;
      link.download = `LegalGuard-${safeCaseNumber}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Не удалось сохранить файл. Попробуйте скопировать текст проекта.');
    }
  }

  async function copyDocument() {
    if (!result?.finalDocument || !allFindingsReviewed || !result.finalControl?.passed) return;
    try {
      await navigator.clipboard.writeText(result.finalDocument);
      setCopied(true);
      setError(null);
    } catch {
      setCopied(false);
      setError('Не удалось скопировать документ. Проверьте разрешения браузера и попробуйте ещё раз.');
    }
  }

  return (
    <main className="shell">
      <header>
        <div>
          <h1>LegalGuard AI</h1>
          <p>Инструмент анализа судебных материалов · контролируемый конвейер</p>
        </div>
        <span className="badge">{providerMode === 'local' ? 'ЛОКАЛЬНАЯ МОДЕЛЬ · БЕЗ ВНЕШНЕГО AI API' : 'РЕЖИМ ПРОВЕРКИ ИНТЕРФЕЙСА'}</span>
      </header>

      <section className="panel metadata">
        <h2>Данные дела</h2>
        <div className="fields">
          <label>Номер дела<input value={caseNumber} disabled={running} onChange={(event) => { setCaseNumber(event.target.value); invalidateResult(); }} placeholder="№ дела" /></label>
          <label>Суд, в который подаётся жалоба<input value={recipientCourtName} disabled={running} onChange={(event) => { setRecipientCourtName(event.target.value); invalidateResult(); }} placeholder="Укажите точное наименование суда" /></label>
          <label>Заявитель / осуждённый<input value={clientName} disabled={running} onChange={(event) => { setClientName(event.target.value); invalidateResult(); }} placeholder="Фамилия, имя, отчество" /></label>
          <label>Суд, вынесший обжалуемый акт<input value={courtName} disabled={running} onChange={(event) => { setCourtName(event.target.value); invalidateResult(); }} placeholder="Наименование суда" /></label>
          <label>Дата акта<input value={verdictDate} disabled={running} onChange={(event) => { setVerdictDate(event.target.value); invalidateResult(); }} placeholder="ДД.ММ.ГГГГ" /></label>
          <label>Вид жалобы<select value={complaintType} disabled={running} onChange={(event) => { setComplaintType(event.target.value as ComplaintType); invalidateResult(); }}><option value="апелляционная">Апелляционная</option><option value="кассационная">Кассационная</option></select></label>
          <label>Источник ИИ<select value={providerMode} disabled={running} onChange={(event) => { setProviderMode(event.target.value as 'test' | 'local'); invalidateResult(); }}><option value="test">Без ИИ — проверка интерфейса</option><option value="local">Локальная модель на устройстве</option></select></label>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Судебный материал</h2>
          {providerMode === 'test' && <p className="control-warning">Тестовый режим не выполняет юридический анализ и не создаёт вымышленные основания.</p>}
          {providerMode === 'local' && <p className="control-warning">Локальная модель работает на устройстве при наличии WebGPU. Для выбранной модели конфигурация WebLLM указывает около 1,63 ГБ требуемой видеопамяти; дополнительно нужны память браузера и место для загрузки весов. Точный объём загрузки зависит от файлов модели и кэша. Текст дела не отправляется во внешний AI API. На неподдерживаемых устройствах анализ не запустится.</p>}
          <div className="upload-row">
            <label className="file-button">Загрузить документы<input type="file" multiple disabled={running} accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void loadFiles(files); }} /></label>
            {fileName && <span className="file-name">{fileName}</span>}
          </div>
          {documents.length > 0 && (
            <div className="document-role-list">
              <p className="muted">Укажите тип каждого файла. Это ваша метка, а не автоматическая проверка содержимого.</p>
              {documents.map((document, index) => (
                <label key={`${document.name}-${index}`}>{document.name}
                  <select value={document.role ?? ''} disabled={running} onChange={(event) => updateDocumentRole(index, event.target.value ? event.target.value as DocumentRole : undefined)}>
                    <option value="">Тип не указан</option>
                    {Object.entries(DOCUMENT_ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          <textarea value={text} disabled={running} onChange={(event) => { setText(event.target.value); setFileName(null); setDocuments([]); invalidateResult(); }} />
          {providerMode === 'local' && <button type="button" disabled={running} onClick={() => void selfTestLocalModel()}>Проверить локальный ИИ</button>}
          {diagnosticMessage && providerMode === 'local' && <p className="muted">{diagnosticMessage}</p>}
          <button disabled={running} onClick={run}>{running ? 'Выполняется…' : 'Запустить анализ'}</button>
          {modelProgress && providerMode === 'local' && <p className="muted">Загрузка локальной модели: {modelProgress}</p>}
          {analysisProgress && <p className="muted" role="status" aria-live="polite">{analysisProgress}</p>}
          {error && <div className="error-box">{error}</div>}
        </article>

        <article className="panel">
          <h2>Контроль работы</h2>
          {!result && <p className="muted">Прогон ещё не выполнен.</p>}
          {result && (
            <>
              <p className="run-id">{result.runId}</p>
              <div className="trace">
                {result.trace.map((item) => (
                  <div className="trace-row" key={item.code}>
                    <span className={`status ${item.status}`}>{item.status === 'ok' ? '✓' : item.status === 'error' ? '✗' : '⚠'}</span>
                    <span><strong>{item.code}</strong><br />{item.message}</span>
                  </div>
                ))}
              </div>
              <div className={result.readyForSubmission ? 'result pass' : 'result block'}>
                {result.finalControl?.passed
                  ? allFindingsReviewed
                    ? 'ВСЕ КАНДИДАТЫ ПРОСМОТРЕНЫ — ПРОЕКТ ВСЁ РАВНО НЕ ГОТОВ К ПОДАЧЕ'
                    : 'ФОРМАЛЬНЫЕ ПРОВЕРКИ ПРОЙДЕНЫ — ОЖИДАЕТСЯ ПРОСМОТР ВСЕХ КАНДИДАТОВ'
                  : 'НЕДОСТАТОЧНО ДАННЫХ / КОНТРОЛЬ НЕ ПРОЙДЕН'}
              </div>
            </>
          )}
        </article>
      </section>

      {result && (
        <section className="panel findings">
          <h2>Решения Арбитра</h2>
          {result.arbiterFindings.some((finding) => finding.status === 'accepted') && <p className="control-warning">Принятие моделью не подтверждает юридическую правильность довода. До показа проекта вручную проверьте каждую цитату по указанному файлу, каждую норму по официальному источнику и редакции на нужную дату, а также применимость нормы к делу. Отметка фиксирует только ваше подтверждение в интерфейсе; система не проверяет факт такой сверки.</p>}
          {result.arbiterFindings.map((finding) => (
            <div className="finding" key={finding.id}>
              <span className={`finding-status ${finding.status}`}>{finding.status === 'accepted' ? 'принято' : finding.status === 'rejected' ? 'отклонено' : 'требует проверки'}</span>
              <div>
                <strong>{finding.id}: {finding.claim}</strong>
                {finding.source?.documentId && <p><strong>Файл-источник:</strong> {finding.source.documentId}</p>}
                <p className="finding-quote"><strong>Цитата из материала:</strong> {finding.sourceQuote ? `«${finding.sourceQuote}»` : 'Не указана — основание нельзя подтвердить по цитате.'}</p>
                <p>{finding.reasoning}</p>
                {finding.legalBasis && finding.legalBasis.length > 0 && (
                  <div className="finding-basis">
                    <p><strong>Предполагаемая правовая основа — НЕ ПРОВЕРЕНА:</strong> {finding.legalBasis.join('; ')}</p>
                    <a href="https://publication.pravo.gov.ru/search" target="_blank" rel="noreferrer">Проверить в официальных публикациях</a>
                  </div>
                )}
                <label className="manual-review">
                  <input type="checkbox" disabled={running} checked={manuallyReviewedFindingIds.includes(finding.id)} onChange={(event) => { setManuallyReviewedFindingIds((current) => event.target.checked ? [...new Set([...current, finding.id])] : current.filter((id) => id !== finding.id)); setCopied(false); }} />
                  {finding.status === 'accepted'
                    ? 'Я вручную сверил цитату с файлом-источником, проверил правовую норму и её редакцию на нужную дату и оценил применимость довода.'
                    : finding.status === 'rejected'
                      ? 'Я просмотрел отклонённый кандидата и согласен исключить его из проекта.'
                      : 'Я просмотрел неразрешённый кандидат и решил не включать его в этот проект.'}
                </label>
              </div>
            </div>
          ))}
        </section>
      )}

      {result?.finalControl && (result.finalControl.blockingReasons.length > 0 || result.finalControl.warnings.length > 0) && (
        <section className="panel control-details">
          <h2>Результат финального контроля</h2>
          {result.finalControl.blockingReasons.map((item) => <p className="control-block" key={item}>✗ {item}</p>)}
          {result.finalControl.warnings.map((item) => <p className="control-warning" key={item}>⚠ {item}</p>)}
        </section>
      )}

      {result?.finalDocument && result.finalControl?.passed && !allFindingsReviewed && <section className="panel control-details"><h2>Проект пока скрыт</h2><p>Просмотрите каждый кандидат. Для принятого довода сверяйте цитату и норму; для отклонённого или неразрешённого подтвердите, что сознательно исключаете его из этого проекта. Это не заменяет профессиональную юридическую проверку.</p><p>Просмотрено: {manuallyReviewedFindingIds.filter((id) => allFindingIds.includes(id)).length} из {allFindingIds.length} кандидатов.</p></section>}

      {result?.finalDocument && result.finalControl?.passed && allFindingsReviewed && (
        <section className="panel document-preview">
          <div className="document-heading">
            <h2>Сформированный документ</h2>
            <button type="button" disabled={running} onClick={() => void copyDocument()}>{copied ? 'Скопировано' : 'Копировать'}</button><button type="button" disabled={running} onClick={downloadDocument}>Скачать TXT</button>
          </div>
          <pre>{result.finalDocument}</pre>
          <div className="source-links" aria-label="Официальные источники правовой информации">
            <a href="https://pravo.gov.ru/" target="_blank" rel="noreferrer">Официальный портал правовой информации</a>
            <a href="https://publication.pravo.gov.ru/search" target="_blank" rel="noreferrer">Поиск официальных публикаций</a>
            <a href="https://pravo.minjust.ru/" target="_blank" rel="noreferrer">Портал НПА Минюста</a>
          </div>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
