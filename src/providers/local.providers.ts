import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm';
import type { AIProviderSet, ArbiterFinding, DeepSeekFinding } from '../core/legalguard.types';
import { validateAnalystFindings, validateArbiterFindings, validateCriticReviews } from '../services/provider-validation';

const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
let enginePromise: Promise<MLCEngine> | null = null;

type WebGPUApi = { requestAdapter: () => Promise<unknown | null> };

function getEngine(): Promise<MLCEngine> {
  const gpu = (navigator as Navigator & { gpu?: WebGPUApi }).gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') {
    throw new Error('На этом браузере или устройстве WebGPU недоступен. Локальная модель не может запуститься. Используйте совместимое устройство; автоматической отправки дела в облако не будет.');
  }
  if (!enginePromise) {
    enginePromise = (async () => {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        throw new Error('Браузер сообщает о WebGPU, но совместимый GPU-адаптер не найден. Загрузка модели остановлена; текст дела не отправляется в облако.');
      }
      return CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report) => {
          window.dispatchEvent(new CustomEvent('legalguard:model-progress', {
            detail: { text: report.text, progress: report.progress },
          }));
        },
      });
    })().catch((error: unknown) => {
      enginePromise = null;
      if (error instanceof Error && error.message.includes('GPU-адаптер')) throw error;
      throw new Error(`Не удалось загрузить локальную модель: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    });
  }
  return enginePromise;
}

async function askJson<T>(system: string, user: string): Promise<T> {
  const engine = await getEngine();
  const response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Локальная модель вернула пустой ответ. Анализ остановлен.');
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error('Локальная модель вернула невалидный JSON. Анализ остановлен, результат не используется.');
  }
}

const ANALYST_PROMPT = `Ты — первый аналитик LegalGuard AI. Исследуй только переданный текст судебного материала. Выделяй возможные проблемы мотивировки, противоречия, пропущенные обстоятельства и потенциально значимые процессуальные вопросы. Не утверждай, что нарушение доказано. Не выдумывай нормы, дела и факты. Возвращай не более 8 кандидатов для одного фрагмента. sourceQuote должен быть дословной цитатой из текста. Не знаешь применимую норму — оставь legalBasis пустым. Верни JSON: {"findings":[{"id":"LG-001","claim":"краткая гипотеза","sourceQuote":"дословная цитата","legalBasis":[],"confidence":0.0}]}. Если оснований не видно, верни {"findings":[]}.`;

const ARBITER_PROMPT = `Ты — второй этап LegalGuard AI на той же модели, а не независимое второе мнение. Проверь каждую гипотезу по переданному судебному тексту. Не принимай вывод только потому, что первый этап его предложил. Отделяй установленный факт от предположения. Если правовая норма или необходимый контекст не представлены, используй needs_review. Не выдумывай правовые ссылки. Верни JSON: {"findings":[{"id":"тот же ID","claim":"...","sourceQuote":"дословная цитата","legalBasis":[],"confidence":0.0,"status":"accepted|rejected|needs_review","legalSignificance":"high|medium|low|none","reasoning":"логика оценки и ограничения","appealCassationRelevance":"..."}]}.`;

const CRITIC_PROMPT = `Ты — третий этап LegalGuard AI, адвокат оппонента и критик. Попытайся опровергнуть каждый принятый вывод: найди альтернативное объяснение, отсутствующий контекст, слабую причинную связь, отсутствие применимой нормы или возможное возражение суда/прокурора. Не выдумывай факты. Ставь clear только если довод действительно выдерживает проверку по переданным материалам; иначе concern или needs_review. Верни JSON: {"reviews":[{"id":"ID основания","status":"clear|concern|needs_review","critique":"конкретное возражение или почему проверка пройдена"}]}.`;

export const localProviders: AIProviderSet = {
  deepSeek: {
    async analyze(documentText: string): Promise<DeepSeekFinding[]> {
      const result = await askJson<{ findings: unknown }>(ANALYST_PROMPT, documentText);
      return validateAnalystFindings(result.findings);
    },
  },
  chatGPT: {
    async arbitrate(documentText: string, findings: DeepSeekFinding[]): Promise<ArbiterFinding[]> {
      const result = await askJson<{ findings: unknown }>(
        ARBITER_PROMPT,
        JSON.stringify({ documentText, findings }),
      );
      const arbiterFindings = validateArbiterFindings(result.findings);

      const reviews = await askJson<{ reviews: unknown }>(
        CRITIC_PROMPT,
        JSON.stringify({ documentText, findings: arbiterFindings }),
      );
      const validatedReviews = validateCriticReviews(reviews.reviews);
      const knownFindingIds = new Set(arbiterFindings.map((finding) => finding.id));
      const unknownReview = validatedReviews.find((review) => !knownFindingIds.has(review.id));
      if (unknownReview) throw new Error(`Третий этап вернул проверку неизвестного основания ${unknownReview.id}.`);
      const reviewById = new Map(validatedReviews.map((review) => [review.id, review]));
      return arbiterFindings.map((finding) => {
        const review = reviewById.get(finding.id);
        if (finding.status === 'accepted' && (!review || review.status !== 'clear')) {
          return {
            ...finding,
            status: 'needs_review',
            reasoning: `${finding.reasoning}\n\nКритическая проверка: ${review?.critique ?? 'третий этап не вернул проверку этого основания'}`,
          };
        }
        if (review && review.critique.trim()) {
          return { ...finding, reasoning: `${finding.reasoning}\n\nКритическая проверка: ${review.critique}` };
        }
        return finding;
      });
    },
  },
};
