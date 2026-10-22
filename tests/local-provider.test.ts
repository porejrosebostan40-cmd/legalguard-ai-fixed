import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());
import { createLocalProviders } from '../src/providers/local.providers';

it('rejects remote endpoints before making a network request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const providers = createLocalProviders('https://example.com/v1/chat/completions', 'test-model');

  await expect(providers.analyst.analyze('Тестовый судебный текст.'))
    .rejects.toThrow('Удалённые адреса запрещены');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('accepts a loopback endpoint for local inference', () => {
  const providers = createLocalProviders('http://127.0.0.1:8080/v1/chat/completions', 'test-model');
  expect(typeof providers.analyst.analyze).toBe('function');
  expect(typeof providers.arbiter.arbitrate).toBe('function');
});

it('checks the local OpenAI-compatible models endpoint', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
    JSON.stringify({ data: [{ id: 'local-model' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));

  const { checkLocalModelConnection } = await import('../src/providers/local.providers');
  await expect(checkLocalModelConnection('http://127.0.0.1:8080/v1/chat/completions'))
    .resolves.toContain('Соединение установлено');
  expect(fetchSpy).toHaveBeenCalledWith(
    'http://127.0.0.1:8080/v1/models',
    { method: 'GET' },
  );
});

it('does not contact a remote host during connection diagnostics', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { checkLocalModelConnection } = await import('../src/providers/local.providers');

  await expect(checkLocalModelConnection('https://example.com/v1/chat/completions'))
    .rejects.toThrow('Удалённые адреса запрещены');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('runs analyst and arbiter against an OpenAI-compatible local response', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ findings: [{
        id: 'model-id-is-replaced',
        claim: 'Суд отметил отсутствие характеристики.',
        sourceQuote: 'осужденный не представил характеристику.',
        confidence: 0.92,
      }] }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ decisions: [{
        id: 'C001-F001',
        status: 'accepted',
        legalSignificance: 'medium',
        reasoning: 'Довод требует сверки с материалами дела.',
      }] }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  const providers = createLocalProviders('http://127.0.0.1:8080/v1/chat/completions', 'local-model');
  const source = 'Суд указал: осужденный не представил характеристику.';
  const findings = await providers.analyst.analyze(source);
  expect(findings).toHaveLength(1);
  expect(findings[0].id).toBe('C001-F001');
  expect(findings[0].sourceQuote).toBe('осужденный не представил характеристику.');
  expect(findings[0].source?.startLine).toBe(1);

  const decisions = await providers.arbiter.arbitrate(source, findings);
  expect(decisions).toHaveLength(1);
  expect(decisions[0].status).toBe('accepted');
  expect(decisions[0].reasoning).toContain('сверки');
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});
