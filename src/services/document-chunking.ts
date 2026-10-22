export const MAX_CHUNK_CHARS = 2800;
export const MAX_DOCUMENT_CHUNKS = 30;

function splitOversizedParagraph(paragraph: string, maxChars: number): string[] {
  const parts: string[] = [];
  let remaining = paragraph.trim();

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const sentenceBoundary = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
    );
    const whitespaceBoundary = window.lastIndexOf(' ');
    const boundary = sentenceBoundary >= Math.floor(maxChars * 0.55)
      ? sentenceBoundary + 1
      : whitespaceBoundary >= Math.floor(maxChars * 0.55)
        ? whitespaceBoundary
        : maxChars;

    parts.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

/**
 * Splits long court materials into bounded pieces without dropping text.
 * The conservative character limit helps keep prompts within the 4K-token
 * context configured for the bundled Qwen2.5 1.5B WebLLM model.
 */
export function splitDocumentIntoChunks(
  documentText: string,
  maxChars = MAX_CHUNK_CHARS,
  maxChunks = MAX_DOCUMENT_CHUNKS,
): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 200) {
    throw new Error('Размер фрагмента должен быть целым числом не меньше 200 символов.');
  }
  if (!Number.isInteger(maxChunks) || maxChunks < 1) {
    throw new Error('Количество фрагментов должно быть положительным целым числом.');
  }

  const normalized = documentText.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  const units = paragraphs.flatMap((paragraph) =>
    paragraph.length > maxChars ? splitOversizedParagraph(paragraph, maxChars) : [paragraph.trim()],
  ).filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = unit;
  }
  if (current) chunks.push(current);

  if (chunks.length > maxChunks) {
    throw new Error(`Материал разделён на ${chunks.length} фрагментов, что превышает безопасный предел ${maxChunks}. Разделите документ на несколько частей и обработайте их отдельно.`);
  }

  return chunks;
}
