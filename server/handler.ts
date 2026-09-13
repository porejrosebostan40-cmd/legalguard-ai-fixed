import type {
  ArbiterFinding,
  DeepSeekFinding,
} from '../src/core/legalguard.types';

export interface LegalGuardServerEnv {
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  OPENAI_MODEL?: string;
  OPENAI_ANALYST_MODEL?: string;
}

type ChatMessage = { role: 'system' | 'user'; content: string };

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function callChatCompletion(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ИИ-провайдер HTTP ${response.status}: ${details.slice(0, 500)}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('ИИ-провайдер вернул пустой JSON-ответ.');
  return content;
}

function parseObject(content: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Ответ ИИ имеет неверную структуру.');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error('ИИ вернул некорректный JSON. Запрос остановлен.');
  }
}

function parseFindings(content: string): DeepSeekFinding[] {
  const object = parseObject(content);
  if (!Array.isArray(object.findings)) throw new Error('Аналитик не вернул массив findings.');
  return object.findings as DeepSeekFinding[];
}

function parseArbiterFindings(content: string): ArbiterFinding[] {
  const object = parseObject(content);
  if (!Array.isArray(object.findings)) throw new Error('Арбитр не вернул массив findings.');
  return object.findings as ArbiterFinding[];
}

const ANALYST_SYSTEM = `Ты аналитик юридического конвейера LegalGuard AI. Анализируй только предоставленный судебный материал. Ищи потенциально значимые факты, процессуальные нарушения, противоречия, ошибки мотивировки и основания для жалобы. Не выдумывай нормы или факты. Каждая находка должна быть привязана к исходному материалу. Верни только JSON вида {"findings":[{"id":"DS-001","claim":"...","sourceQuote":"...","legalBasis":[],"confidence":0.0}]}.`;

const ARBITER_SYSTEM = `Ты Арбитр LegalGuard AI. Ты проверяешь находки другого ИИ и имеешь право их отклонить. Для каждого finding реши: accepted, rejected или needs_review. Отделяй юридически значимое основание от шума. Проверяй фактическую опору на судебный материал, применимость нормы и значение для выбранного вида жалобы. Не выдумывай факты, нормы и судебную практику. Если данных недостаточно, используй needs_review, а не догадку. Верни только JSON вида {"findings":[{"id":"DS-001","claim":"...","sourceQuote":"...","legalBasis":[],"confidence":0.0,"status":"accepted","legalSignificance":"high","reasoning":"...","appealCassationRelevance":"..."}]}.`;

async function analyze(documentText: string, env: LegalGuardServerEnv): Promise<DeepSeekFinding[]> {
  if (env.DEEPSEEK_API_KEY) {
    const content = await callChatCompletion(
      'https://api.deepseek.com/chat/completions',
      env.DEEPSEEK_API_KEY,
      env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro',
      [
        { role: 'system', content: ANALYST_SYSTEM },
        { role: 'user', content: documentText },
      ],
    );
    return parseFindings(content);
  }

  if (env.OPENAI_API_KEY) {
    const content = await callChatCompletion(
      'https://api.openai.com/v1/chat/completions',
      env.OPENAI_API_KEY,
      env.OPENAI_ANALYST_MODEL ?? 'gpt-5.6-luna',
      [
        { role: 'system', content: `${ANALYST_SYSTEM}\nСейчас ты работаешь как первичный аналитик. Не принимай окончательное решение по находкам: это задача Арбитра.` },
        { role: 'user', content: documentText },
      ],
    );
    return parseFindings(content);
  }

  throw new Error('Не задан ключ аналитического провайдера: DEEPSEEK_API_KEY или OPENAI_API_KEY.');
}

async function arbitrate(
  documentText: string,
  findings: DeepSeekFinding[],
  env: LegalGuardServerEnv,
): Promise<ArbiterFinding[]> {
  if (!env.OPENAI_API_KEY) throw new Error('Не задан OPENAI_API_KEY на сервере.');
  const content = await callChatCompletion(
    'https://api.openai.com/v1/chat/completions',
    env.OPENAI_API_KEY,
    env.OPENAI_MODEL ?? 'gpt-5.6-sol',
    [
      { role: 'system', content: ARBITER_SYSTEM },
      {
        role: 'user',
        content: JSON.stringify({ documentText, findings }),
      },
    ],
  );
  return parseArbiterFindings(content);
}

export async function handleLegalGuardRequest(
  request: Request,
  env: LegalGuardServerEnv,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается.' }, 405);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.documentText !== 'string' || !body.documentText.trim()) {
      return json({ error: 'Не передан текст судебного материала.' }, 400);
    }

    if (request.url.endsWith('/api/deepseek/analyze')) {
      return json({ data: await analyze(body.documentText, env) });
    }

    if (request.url.endsWith('/api/chatgpt/arbitrate')) {
      if (!Array.isArray(body.findings)) return json({ error: 'Не переданы findings.' }, 400);
      return json({
        data: await arbitrate(body.documentText, body.findings as DeepSeekFinding[], env),
      });
    }

    return json({ error: 'Неизвестный маршрут LegalGuard API.' }, 404);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Внутренняя ошибка сервера.',
    }, 500);
  }
}
