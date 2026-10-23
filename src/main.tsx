import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LegalGuardPipeline } from './services/legalguard.pipeline';
import { mockProviders } from './providers/mock.providers';
import { textReviewProviders } from './providers/text-review.providers';
import { checkLocalModelConnection, createLocalProviders } from './providers/local.providers';
import { readTextDocument } from './services/document-ingestion';
import type { ComplaintType, LegalGuardResult } from './core/legalguard.types';
import './styles.css';

function App() {
  const [text, setText] = useState('');
  const [complaintType, setComplaintType] = useState<ComplaintType>('кассационная');
  const [loadingFile, setLoadingFile] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [providerMode, setProviderMode] = useState<'text' | 'test' | 'local'>('text');
  const [localEndpoint, setLocalEndpoint] = useState('http://127.0.0.1:8080/v1/chat/completions');
  const [localModel, setLocalModel] = useState('local-model');
  const [checkingLocal, setCheckingLocal] = useState(false);
  const [localStatus, setLocalStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [result, setResult] = useState<LegalGuardResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pipeline = useMemo(
    () => new LegalGuardPipeline(
      providerMode === 'test' ? mockProviders : providerMode === 'text' ? textReviewProviders : createLocalProviders(localEndpoint, localModel),
    ),
    [providerMode, localEndpoint, localModel],
  );

  async function checkLocalConnection() {
    setCheckingLocal(true);
    setLocalStatus(null);
    try {
      const message = await checkLocalModelConnection(localEndpoint, localModel);
      setLocalStatus({ kind: 'ok', message });
    } catch (cause) {
      setLocalStatus({ kind: 'error', message: cause instanceof Error ? cause.message : 'Не удалось проверить локальный сервер.' });
    } finally {
      setCheckingLocal(false);
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setUploadStatus(`Выбран файл: ${file.name}. Чтение…`);
    setLoadingFile(true);
    try {
      const document = await readTextDocument(file);
      setText(document.text);
      setUploadStatus(`Загружен: ${document.name} · извлечено ${document.text.length.toLocaleString('ru-RU')} символов`);
      setResult(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Не удалось прочитать файл.';
      setUploadStatus(`Не удалось загрузить: ${file.name}`);
      setError(message);
    } finally {
      setLoadingFile(false);
    }
  }

  async function run() {
    if (text.trim().length < 20) {
      setError('Вставьте текст судебного акта (не менее 20 символов) или загрузите TXT, текстовый PDF либо DOCX.');
      setResult(null);
      return;
    }
    if (providerMode === 'test') {
      setError('Выбран демонстрационный режим. Он не анализирует документ. Переключите источник ИИ на «Проверка текста без ИИ» или «Локальная модель».');
      setResult(null);
      return;
    }
    setRunning(true);
    setError(null);
    setCopied(false);
    try {
      const next = await pipeline.run(text, {
        caseNumber: '—',
        courtName: '—',
        verdictDate: '—',
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
        <h2>Режим работы</h2>
        <div className="settings-row">
          <label>Вид жалобы
            <select value={complaintType} onChange={(event) => setComplaintType(event.target.value as ComplaintType)}>
              <option value="апелляционная">Апелляционная</option>
              <option value="кассационная">Кассационная</option>
            </select>
          </label>
          <label>Источник анализа
            <select value={providerMode} onChange={(event) => setProviderMode(event.target.value as 'text' | 'test' | 'local')}>
              <option value="text">Проверка текста без ИИ</option>
              <option value="local">Локальная модель</option>
              <option value="test">Демонстрационный тест</option>
            </select>
          </label>
        </div>
        {providerMode === 'local' && (
          <label className="local-endpoint">Адрес локального OpenAI-совместимого сервера
            <input value={localEndpoint} onChange={(event) => { setLocalEndpoint(event.target.value); setLocalStatus(null); }} placeholder="http://127.0.0.1:8080/v1/chat/completions" />
            <span className="muted">Модель должна работать локально, а сервер — разрешать запросы браузера (CORS).</span>
            <span>Имя модели<input value={localModel} onChange={(event) => { setLocalModel(event.target.value); setLocalStatus(null); }} placeholder="local-model" /></span>
            <button type="button" disabled={checkingLocal} onClick={() => void checkLocalConnection()}>{checkingLocal ? 'Проверка…' : 'Проверить подключение'}</button>
            {localStatus && <p className={`connection-status ${localStatus.kind}`}>{localStatus.message}</p>}
          </label>
        )}
        {providerMode === 'text' && <p className="mode-note">Локальная проверка ищет в тексте судебного акта фрагменты по заданным признакам и показывает точные цитаты для ручной проверки. Это не ИИ-анализ и не заключение о нарушении закона. Сканированные PDF без текстового слоя не поддерживаются.</p>}
        {providerMode === 'test' && <p className="mode-note">Демонстрационный режим показывает заранее заданные примеры и не анализирует ваш документ.</p>}
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Судебный материал</h2>
          <div className="upload-row">
            <label className="file-button">{loadingFile ? 'Чтение файла…' : 'Выбрать судебный документ (TXT / PDF / DOCX)'}<input type="file" accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={loadingFile} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; if (!file) { setUploadStatus('Файл не выбран.'); return; } void loadFile(file); }} /></label>
            {uploadStatus && <span className="file-name" role="status">{uploadStatus}</span>}
          </div>
          <textarea aria-label="Текст судебного акта" placeholder="Вставьте текст судебного акта сюда или выберите файл выше…" value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} />
          <p className="muted">Знаков: {text.length.toLocaleString('ru-RU')} · слов: {text.trim() ? text.trim().split(/\s+/).length.toLocaleString('ru-RU') : 0}</p>
          <button disabled={running || loadingFile} onClick={run}>{running ? 'Выполняется…' : 'Запустить анализ'}</button>
          {error && <div className="error-box">{error}</div>}
        </article>

        <article className="panel">
          <h2>Контроль работы</h2>
          {!result && <p className="muted">Прогон ещё не выполнен.</p>}
          {result && (
            <>
              <p className="run-id">{result.runId}</p>
              <p className="muted">Найдено фрагментов: {result.findings.length}. Требуют проверки: {result.arbiterFindings.filter((finding) => finding.status === 'needs_review').length}. Принято Арбитром: {result.arbiterFindings.filter((finding) => finding.status === 'accepted').length}.</p>
              {result.findings.length === 0 && <p className="mode-note">Совпадений по текущим текстовым признакам не найдено. Это не доказывает отсутствие юридически значимых обстоятельств.</p>}
              <div className="trace">
                {result.trace.map((item) => (
                  <div className="trace-row" key={item.code}>
                    <span className={`status ${item.status}`}>{item.status === 'ok' ? '✓' : item.status === 'error' ? '✗' : '⚠'}</span>
                    <span><strong>{item.code}</strong><br />{item.message}</span>
                  </div>
                ))}
              </div>
              <div className={result.readyForSubmission ? 'result pass' : result.finalControl?.passed ? 'result draft' : 'result block'}>
                {result.readyForSubmission
                  ? 'ГОТОВО К ПОДАЧЕ'
                  : result.finalControl?.passed
                    ? 'ЧЕРНОВИК · ЮРИДИЧЕСКАЯ ПРОВЕРКА ОБЯЗАТЕЛЬНА'
                    : 'ЧЕРНОВИК НЕ СФОРМИРОВАН'}
              </div>
            </>
          )}
        </article>
      </section>

      {result && (
        <section className="panel findings">
          <h2>Решения Арбитра</h2>
          {result.arbiterFindings.length === 0 && <p className="muted">Решений нет: первичный анализ не обнаружил совпадений по текущим признакам.</p>}
          {result.arbiterFindings.map((finding) => (
            <div className="finding" key={finding.id}>
              <span className={`finding-status ${finding.status}`}>{finding.status === 'accepted' ? 'принято' : finding.status === 'rejected' ? 'отклонено' : 'требует проверки'}</span>
              <div><strong>{finding.id}: {finding.claim}</strong><p>{finding.reasoning}</p><p className="source-quote">Цитата из материала: {finding.source?.quote || finding.sourceQuote || 'не предоставлена'}</p></div>
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
            <h2>Черновик документа · требуется юридическая проверка</h2>
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
