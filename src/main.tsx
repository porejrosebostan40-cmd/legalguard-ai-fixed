import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LegalGuardPipeline } from './services/legalguard.pipeline';
import { mockProviders } from './providers/mock.providers';
import { combineDocuments, readTextDocument, validateDocumentBatch } from './services/document-ingestion';
import type { DocumentInput } from './services/document-ingestion';
import type { ComplaintType, LegalGuardResult } from './core/legalguard.types';
import './styles.css';

function App() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [caseNumber, setCaseNumber] = useState('');
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
    setAnalysisProgress(null);
  }

  async function loadFiles(files: File[]) {
    if (files.length === 0) return;
    invalidateResult();
    setText('');
    setFileName(null);
    setError(null);
    try {
      validateDocumentBatch(files);
      const documents: DocumentInput[] = [];
      // Sequential parsing avoids loading several large PDF workers into memory at once.
      for (const file of files) documents.push(await readTextDocument(file));
      setText(combineDocuments(documents));
      setFileName(documents.map((document) => document.name).join(', '));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось прочитать документы.');
    }
  }

  async function run() {
    setRunning(true);
    setError(null);
    setCopied(false);
    setResult(null);
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
      const next = await pipeline.run(text, {
        caseNumber: caseNumber || '—',
        courtName: courtName || '—',
        verdictDate: verdictDate || '—',
        clientName: '—',
        complaintType,
      });
      setResult(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка провайдера.');
      setResult(null);
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
    if (!result?.finalDocument) return;
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
      URL.revokeObjectURL(url);
    } catch {
      setError('Не удалось сохранить файл. Попробуйте скопировать текст проекта.');
    }
  }

  async function copyDocument() {
    if (!result?.finalDocument) return;
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
        <span className="badge">{providerMode === 'local' ? 'ЛОКАЛЬНЫЙ ИИ · БЕЗ API' : 'РЕЖИМ ПРОВЕРКИ ИНТЕРФЕЙСА'}</span>
      </header>

      <section className="panel metadata">
        <h2>Данные дела</h2>
        <div className="fields">
          <label>Номер дела<input value={caseNumber} disabled={running} onChange={(event) => { setCaseNumber(event.target.value); invalidateResult(); }} placeholder="№ дела" /></label>
          <label>Суд<input value={courtName} disabled={running} onChange={(event) => { setCourtName(event.target.value); invalidateResult(); }} placeholder="Наименование суда" /></label>
          <label>Дата акта<input value={verdictDate} disabled={running} onChange={(event) => { setVerdictDate(event.target.value); invalidateResult(); }} placeholder="ДД.ММ.ГГГГ" /></label>
          <label>Вид жалобы<select value={complaintType} disabled={running} onChange={(event) => { setComplaintType(event.target.value as ComplaintType); invalidateResult(); }}><option value="апелляционная">Апелляционная</option><option value="кассационная">Кассационная</option></select></label>
          <label>Источник ИИ<select value={providerMode} disabled={running} onChange={(event) => { setProviderMode(event.target.value as 'test' | 'local'); invalidateResult(); }}><option value="test">Без ИИ — проверка интерфейса</option><option value="local">Локальная модель на устройстве</option></select></label>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Судебный материал</h2>
          {providerMode === 'test' && <p className="control-warning">Тестовый режим не выполняет юридический анализ и не создаёт вымышленные основания.</p>}
          {providerMode === 'local' && <p className="control-warning">Локальная модель работает на устройстве при наличии WebGPU. При первом запуске потребуется загрузка модели примерно на 1–2 ГБ. Текст дела не отправляется в AI API. На неподдерживаемых устройствах анализ не запустится.</p>}
          <div className="upload-row">
            <label className="file-button">Загрузить документы<input type="file" multiple disabled={running} accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void loadFiles(files); }} /></label>
            {fileName && <span className="file-name">{fileName}</span>}
          </div>
          <textarea value={text} disabled={running} onChange={(event) => { setText(event.target.value); setFileName(null); invalidateResult(); }} />
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
                {result.finalControl?.passed ? 'ЧЕРНОВИК СОЗДАН — ТРЕБУЕТ ПРОВЕРКИ' : 'НЕДОСТАТОЧНО ДАННЫХ / КОНТРОЛЬ НЕ ПРОЙДЕН'}
              </div>
            </>
          )}
        </article>
      </section>

      {result && (
        <section className="panel findings">
          <h2>Решения Арбитра</h2>
          {result.arbiterFindings.map((finding) => (
            <div className="finding" key={finding.id}>
              <span className={`finding-status ${finding.status}`}>{finding.status === 'accepted' ? 'принято' : finding.status === 'rejected' ? 'отклонено' : 'требует проверки'}</span>
              <div>
                <strong>{finding.id}: {finding.claim}</strong>
                <p className="finding-quote"><strong>Цитата из материала:</strong> {finding.sourceQuote ? `«${finding.sourceQuote}»` : 'Не указана — основание нельзя подтвердить по цитате.'}</p>
                <p>{finding.reasoning}</p>
                {finding.legalBasis && finding.legalBasis.length > 0 && (
                  <div className="finding-basis">
                    <p><strong>Предполагаемая правовая основа — НЕ ПРОВЕРЕНА:</strong> {finding.legalBasis.join('; ')}</p>
                    <a href="https://publication.pravo.gov.ru/search" target="_blank" rel="noreferrer">Проверить в официальных публикациях</a>
                  </div>
                )}
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

      {result?.finalDocument && (
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
