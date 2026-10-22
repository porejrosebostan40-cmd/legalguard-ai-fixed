import type {
  AIProviderSet,
  ArbiterFinding,
  DeepSeekFinding,
} from '../core/legalguard.types';

/**
 * Safe placeholder for UI and pipeline wiring tests.
 * It intentionally does not invent legal findings from arbitrary text.
 * This provider is not a legal analysis engine.
 */
export const mockProviders: AIProviderSet = {
  deepSeek: {
    async analyze(_documentText): Promise<DeepSeekFinding[]> {
      return [];
    },
  },
  chatGPT: {
    async arbitrate(_documentText, _findings): Promise<ArbiterFinding[]> {
      return [];
    },
  },
};
