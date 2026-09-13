import { handleLegalGuardRequest } from '../../server/handler';

export default function handler(request: Request): Promise<Response> {
  return handleLegalGuardRequest(request, {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_ANALYST_MODEL: process.env.OPENAI_ANALYST_MODEL,
  });
}
