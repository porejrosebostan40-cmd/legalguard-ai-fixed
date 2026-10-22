import type { AIProviderSet, ArbiterFinding, ComplaintType, DeepSeekFinding } from '../core/legalguard.types';
import { validateAnalystFindings, validateArbiterFindings } from '../services/provider-validation';

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

function unwrapFindings(payload: unknown): unknown {
  if (typeof payload === 'object' && payload !== null && 'findings' in payload) {
    return (payload as { findings: unknown }).findings;
  }
  return payload;
}

export const httpProviders: AIProviderSet = {
  deepSeek: {
    async analyze(documentText: string, complaintType?: ComplaintType): Promise<DeepSeekFinding[]> {
      const result = await postJson<unknown>('/api/deepseek/analyze', { documentText, complaintType });
      return validateAnalystFindings(unwrapFindings(result));
    },
  },
  chatGPT: {
    async arbitrate(documentText: string, findings: DeepSeekFinding[], complaintType?: ComplaintType): Promise<ArbiterFinding[]> {
      const result = await postJson<unknown>('/api/chatgpt/arbitrate', { documentText, findings, complaintType });
      return validateArbiterFindings(unwrapFindings(result));
    },
  },
};
