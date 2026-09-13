import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LegalGuardPipeline } from './services/legalguard.pipeline';
import { mockProviders } from './providers/mock.providers';
import type { LegalGuardResult } from './core/legalguard.types';
import './styles.css';

const pipeline = new LegalGuardPipeline(mockProviders);

function App() {
  const [text, setText] = useState('Вставьте текст судебного акта для тестового прогона.');
  const [result, setResult] = useState<LegalGuardResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const next = await pipeline.run(text, {
        caseNumber: '—',
        courtName: '—',
        verdictDate: '—',
        clientName: '—',
        complaintType: 'кассационная',
      });
      setResult(next);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="shell">
      <header>
        <div>
          <h1>LegalGuard AI</h1>
          <p>Карманный адвокат · контроль юридического конвейера</p>
        </div>
        <span className="badge">ТЕСТОВЫЙ РЕЖИМ</span>
      </header>

      <section className="grid">
        <article className="panel">
          <h2>Судебный материал</h2>
          <textarea value={text} onChange={(event) => setText(event.target.value)} />
          <button disabled={running} onClick={run}>{running ? 'Выполняется…' : 'Запустить анализ'}</button>
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
          <h2>Решения арбитра</h2>
          {result.arbiterFindings.map((finding) => (
            <div className="finding" key={finding.id}>
              <span className={`finding-status ${finding.status}`}>{finding.status}</span>
              <div><strong>{finding.id}: {finding.claim}</strong><p>{finding.reasoning}</p></div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
