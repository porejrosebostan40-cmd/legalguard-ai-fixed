import { handleLegalGuardRequest } from '../../server/handler';

const env = (globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};

export default function handler(request: Request): Promise<Response> {
  return handleLegalGuardRequest(request, {
    DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    DEEPSEEK_MODEL: env.DEEPSEEK_MODEL,
    OPENAI_MODEL: env.OPENAI_MODEL,
    OPENAI_ANALYST_MODEL: env.OPENAI_ANALYST_MODEL,
  });
}
