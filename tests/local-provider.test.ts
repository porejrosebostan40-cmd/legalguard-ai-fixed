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
