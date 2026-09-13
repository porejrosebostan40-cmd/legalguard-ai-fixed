import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LegalGuardPipeline } from './services/legalguard.pipeline';
import { mockProviders } from './providers/mock.providers';
import { httpProviders } from './providers/http.providers';
import { readTextDocument } from './services/document-ingestion';
import type { ComplaintType, LegalGuardResult } from './core/legalguard.types';
import './styles.css';

function App() {
  const [text, setText] = useState('Вставьте текст судебного акта для анализа.');
  const [fileName, setFileName] = useState<string | null>(null);
  const [caseNumber, setCaseNumber] = useState('');
  const [courtName, setCourtName] = useState('');
  const [verdictDate, setVerdictDate] = useState('');
  const [complaintType, setComplaintType] = useState<ComplaintType>('кассационная');
  const [providerMode, setProviderMode] = useState<'test' | 'server'>('test');
  const [result, setResult] = useState<LegalGuardResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pipeline = useMemo(
    () => new LegalGuardPipeline(providerMode === 'test' ? mockProviders : httpProviders),
    [providerMode],
  );

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const document = await readTextDocument(file);
      setText(document.text);
      setFileName(document.name);
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось прочитать файл.');
    }
  }

  async function run() {
    setRunning(true);
    setError(null);
    setCopied(false);
    try {
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

  async function copyDocument() {
    if (!result?.finalDocument) return;
    await navigator.clipboard.writeText(result.finalDocument);
    setCopied(true);
  }

  return (
    <main className="shell">
      <header>
        <div>
          <h1>LegalGuard AI</h1>
          <p>Карманный адвокат · контролируемый юридический конвейер</p>
        </div>
        <span className="badge">MVP · БЕЗ КЛЮЧЕЙ В БРАУЗЕРЕ</span>
      </header>

      <section className="panel metadata">
        <h2>Данные дела</h2>
        <div className="fields">
          <label>Номер дела<input value={caseNumber} onChange={(event) => setCaseNumber(event.target.value)} placeholder="№ дела" /></label>
          <label>Суд<input value={courtName} onChange={(event) => setCourtName(event.target.value)} placeholder="Наименование суда" /></label>
          <label>Дата акта<input value={verdictDate} onChange={(event) => setVerdictDate(event.target.value)} placeholder="ДД.ММ.ГГГГ" /></label>
          <label>Вид жалобы<select value={complaintType} onChange={(event) => setComplaintType(event.target.value as ComplaintType)}><option value="апелляционная">Апелляционная</option><option value="кассационная">Кассационная</option></select></label>
          <label>Источник ИИ<select value={providerMode} onChange={(event) => setProviderMode(event.target.value as 'test' | 'server')}><option value="test">Тестовый прогон</option><option value="server">Серверный провайдер</option></select></label>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Судебный материал</h2>
          <div className="upload-row">
            <label className="file-button">Загрузить TXT<input type="file" accept=".txt,text/plain" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
            {fileName && <span className="file-name">{fileName}</span>}
          </div>
          <textarea value={text} onChange={(event) => { setText(event.target.value); setFileName(null); }} />
          <button disabled={running} onClick={run}>{running ? 'Выполняется…' : 'Запустить анализ'}</button>
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
                {result.readyForSubmission ? 'ГОТОВО К ПОДАЧЕ' : 'ПОДАЧА ЗАБЛОКИРОВАНА'}
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
              <div><strong>{finding.id}: {finding.claim}</strong><p>{finding.reasoning}</p></div>
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
            <button type="button" onClick={() => void copyDocument()}>{copied ? 'Скопировано' : 'Копировать'}</button>
          </div>
          <pre>{result.finalDocument}</pre>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
