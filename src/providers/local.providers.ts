import type {
  AIProviderSet,
  ArbiterFinding,
  DeepSeekFinding,
  FindingStatus,
  LegalSignificance,
} from '../core/legalguard.types';

interface LocalChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function parseJsonObject<T>(content: string): T {
  const trimmed = content.trim().replace(/^\u0060\u0060\u0060(?:json)?\s*/i, '').replace(/\s*\u0060\u0060\u0060$/, '');
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first < 0 || last <= first) {
      throw new Error('Локальная модель вернула ответ без JSON-объекта.');
    }
    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as T;
    } catch {
      throw new Error('Локальная модель вернула некорректный JSON.');
    }
  }
}

function validateLoopbackEndpoint(endpoint: string): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    throw new Error('Адрес локальной модели должен быть корректным URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)) {
    throw new Error('Локальный режим разрешает только localhost, 127.0.0.1 или ::1. Удалённые адреса запрещены.');
  }
}

async function completeJson<T>(endpoint: string, modelName: string, system: string, user: string): Promise<T> {
  validateLoopbackEndpoint(endpoint);
  if (!modelName.trim()) throw new Error('Укажите имя локальной модели.');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        stream: false,
      }),
    });
  } catch {
    throw new Error(`Не удалось подключиться к локальной модели по адресу ${endpoint}. Проверьте, что локальный сервер запущен и разрешён CORS.`);
  }

  if (!response.ok) {
    throw new Error(`Локальный сервер модели вернул HTTP ${response.status}.`);
  }

  const payload = await response.json() as LocalChatResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Локальная модель вернула пустой ответ.');
  }
  return parseJsonObject<T>(content);
}


export async function checkLocalModelConnection(endpoint: string): Promise<string> {
  validateLoopbackEndpoint(endpoint);
  const modelsUrl = new URL(endpoint);
  modelsUrl.pathname = '/v1/models';
  modelsUrl.search = '';
  modelsUrl.hash = '';

  let response: Response;
  try {
    response = await fetch(modelsUrl.toString(), { method: 'GET' });
  } catch {
    throw new Error('Нет соединения с локальным сервером. Проверьте запуск llama-server, адрес и разрешение CORS.');
  }

  if (!response.ok) {
    throw new Error(`Локальный сервер ответил HTTP ${response.status} на проверку /v1/models.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Сервер доступен, но вернул некорректный ответ на /v1/models.');
  }

  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Сервер доступен, но его ответ не похож на OpenAI-совместимый список моделей.');
  }

  return `Соединение установлено. Сервер сообщает моделей: ${payload.data.length}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function splitDocumentIntoChunks(text: string, maxChars = 4500, overlap = 300): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const lineBreak = text.lastIndexOf('\n', end);
      const space = text.lastIndexOf(' ', end);
      const boundary = lineBreak > start + maxChars * 0.6
        ? lineBreak
        : space > start + maxChars * 0.6
          ? space
          : end;
      end = boundary;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export function createLocalProviders(endpoint: string, modelName = 'local-model'): AIProviderSet {
  const url = endpoint.trim();

  return {
    analyst: {
      async analyze(documentText: string): Promise<DeepSeekFinding[]> {
        const chunks = splitDocumentIntoChunks(documentText);
        const allFindings: DeepSeekFinding[] = [];

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          const chunkText = chunks[chunkIndex];
          const result = await completeJson<{ findings?: unknown }>(
            url,
            modelName,
            [
              'Ты первичный аналитик судебного материала. Верни только JSON вида {"findings":[...]}.',
              'Используй только факты из переданного фрагмента. Не придумывай факты, цитаты, номера страниц или нормы закона.',
              'Каждая находка должна содержать id, claim, sourceQuote и confidence от 0 до 1; legalBasis допускается только если норма прямо указана в материале.',
              'sourceQuote должен быть дословным непрерывным фрагментом переданного фрагмента, включая исходную пунктуацию. Если подтверждающей цитаты нет, не включай находку.',
            ].join(' '),
            JSON.stringify({ chunkNumber: chunkIndex + 1, totalChunks: chunks.length, chunkText }),
          );

          if (!Array.isArray(result.findings)) {
            throw new Error(`Локальный аналитик не вернул массив findings для фрагмента ${chunkIndex + 1}.`);
          }

          result.findings.forEach((item, findingIndex) => {
            if (
              !isRecord(item) ||
              typeof item.id !== 'string' ||
              typeof item.claim !== 'string' ||
              typeof item.sourceQuote !== 'string' ||
              typeof item.confidence !== 'number' ||
              !Number.isFinite(item.confidence) ||
              item.confidence < 0 ||
              item.confidence > 1 ||
              (item.legalBasis !== undefined && !isStringArray(item.legalBasis))
            ) {
              throw new Error(`Локальный аналитик вернул некорректную находку №${findingIndex + 1} во фрагменте ${chunkIndex + 1}.`);
            }

            const firstQuoteIndex = documentText.indexOf(item.sourceQuote);
            const quoteIndex = firstQuoteIndex >= 0 && documentText.indexOf(item.sourceQuote, firstQuoteIndex + 1) === -1
              ? firstQuoteIndex
              : -1;
            const sourceLineStart = quoteIndex >= 0
              ? documentText.slice(0, quoteIndex).split('\n').length
              : undefined;
            const sourceLineEnd = sourceLineStart !== undefined
              ? sourceLineStart + item.sourceQuote.split('\n').length - 1
              : undefined;

            allFindings.push({
              id: `C${String(chunkIndex + 1).padStart(3, '0')}-F${String(findingIndex + 1).padStart(3, '0')}`,
              claim: item.claim,
              sourceQuote: item.sourceQuote,
              source: {
                documentId: 'uploaded-material',
                quote: item.sourceQuote,
                ...(sourceLineStart !== undefined ? { startLine: sourceLineStart } : {}),
                ...(sourceLineEnd !== undefined ? { endLine: sourceLineEnd } : {}),
              },
              confidence: item.confidence,
              ...(isStringArray(item.legalBasis) ? { legalBasis: item.legalBasis } : {}),
            });
          });
        }

        const uniqueFindings = new Map<string, DeepSeekFinding>();
        for (const finding of allFindings) {
          const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
          const key = `${normalize(finding.claim)}|${normalize(finding.sourceQuote || '')}`;
          if (!uniqueFindings.has(key)) uniqueFindings.set(key, finding);
        }

        return [...uniqueFindings.values()];
      },
    },
    arbiter: {
      async arbitrate(documentText: string, findings: DeepSeekFinding[]): Promise<ArbiterFinding[]> {
        const allDecisions: unknown[] = [];
        const batchSize = 8;

        for (let offset = 0; offset < findings.length; offset += batchSize) {
          const batch = findings.slice(offset, offset + batchSize).map((finding) => {
            const quote = finding.source?.quote || finding.sourceQuote || '';
            const quoteIndex = quote ? documentText.indexOf(quote) : -1;
            const context = quoteIndex >= 0
              ? documentText.slice(Math.max(0, quoteIndex - 600), Math.min(documentText.length, quoteIndex + quote.length + 600))
              : quote;
            return { ...finding, sourceContext: context };
          });

          const result = await completeJson<{ decisions?: unknown }>(
            url,
            modelName,
            [
              'Ты независимый юридический Арбитр. Верни только JSON вида {"decisions":[...]}.',
              'Для каждого переданного id верни ровно одно решение: accepted, rejected или needs_review.',
              'Принимай основание только если claim логически следует из sourceQuote и sourceContext.',
              'Не выдумывай правовые нормы и судебную практику. Если правовая значимость не может быть установлена по предоставленным данным, используй needs_review.',
              'Для каждого решения укажи id, status, legalSignificance (high, medium, low или none), reasoning. Не меняй и не создавай id.',
            ].join(' '),
            JSON.stringify({ findings: batch }),
          );

          if (!Array.isArray(result.decisions)) {
            throw new Error(`Локальный Арбитр не вернул массив decisions для пакета ${Math.floor(offset / batchSize) + 1}.`);
          }
          allDecisions.push(...result.decisions);
        }

        const decisions = new Map<string, Record<string, unknown>>();
        for (const item of allDecisions) {
          if (!isRecord(item) || typeof item.id !== 'string' || decisions.has(item.id)) {
            throw new Error('Локальный Арбитр вернул решение с некорректным или повторяющимся id.');
          }
          decisions.set(item.id, item);
        }

        const knownIds = new Set(findings.map((finding) => finding.id));
        for (const id of decisions.keys()) {
          if (!knownIds.has(id)) throw new Error(`Локальный Арбитр создал неизвестное основание ${id}.`);
        }
        for (const finding of findings) {
          if (!decisions.has(finding.id)) {
            throw new Error(`Локальный Арбитр не вынес решение по основанию ${finding.id}.`);
          }
        }

        return findings.map((finding) => {
          const decision = decisions.get(finding.id)!;
          const validStatuses: FindingStatus[] = ['accepted', 'rejected', 'needs_review'];
          const validSignificance: LegalSignificance[] = ['high', 'medium', 'low', 'none'];
          if (
            !validStatuses.includes(decision.status as FindingStatus) ||
            !validSignificance.includes(decision.legalSignificance as LegalSignificance) ||
            typeof decision.reasoning !== 'string'
          ) {
            throw new Error(`Локальный Арбитр вернул некорректное решение по основанию ${finding.id}.`);
          }
          return {
            ...finding,
            status: decision.status as FindingStatus,
            legalSignificance: decision.legalSignificance as LegalSignificance,
            reasoning: decision.reasoning,
          };
        });
      },
    },
  };
}
