import { expect, it, vi } from 'vitest';
import { createLocalProviders } from '../src/providers/local.providers';

it('rejects remote endpoints before making a network request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const providers = createLocalProviders('https://example.com/v1/chat/completions', 'test-model');

  await expect(providers.analyst.analyze('Тестовый судебный текст.'))
    .rejects.toThrow('Удалённые адреса запрещены');
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

it('accepts a loopback endpoint for local inference', () => {
  const providers = createLocalProviders('http://127.0.0.1:8080/v1/chat/completions', 'test-model');
  expect(typeof providers.analyst.analyze).toBe('function');
  expect(typeof providers.arbiter.arbitrate).toBe('function');
});
