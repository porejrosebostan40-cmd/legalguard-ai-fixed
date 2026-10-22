import { describe, expect, it } from 'vitest';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';

describe('bundled WebLLM model configuration', () => {
  it('contains the exact model ID selected by the local provider', () => {
    const model = prebuiltAppConfig.model_list.find((item) => item.model_id === 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
    expect(model).toBeDefined();
    expect(model?.overrides?.context_window_size).toBe(4096);
  });
});
