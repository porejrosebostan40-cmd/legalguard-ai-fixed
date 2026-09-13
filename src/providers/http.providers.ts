import type { AIProviderSet, ArbiterFinding, DeepSeekFinding } from '../core/legalguard.types';

type JsonResponse<T> = { data: T };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Провайдер вернул HTTP ${response.status}: ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as JsonResponse<T>).data;
  }
  return payload as T;
}

export const httpProviders: AIProviderSet = {
  deepSeek: {
    analyze(documentText: string): Promise<DeepSeekFinding[]> {
      return postJson('/api/deepseek/analyze', { documentText });
    },
  },
  chatGPT: {
    arbitrate(documentText: string, findings: DeepSeekFinding[]): Promise<ArbiterFinding[]> {
      return postJson('/api/chatgpt/arbitrate', { documentText, findings });
    },
  },
};
