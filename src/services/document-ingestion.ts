export interface DocumentInput {
  name: string;
  text: string;
  mimeType: string;
}

export function normalizeDocumentText(text: string): string {
  return text
    .replaceAll('\u0000', '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export async function readTextDocument(file: File): Promise<DocumentInput> {
  if (file.type && file.type !== 'text/plain') {
    throw new Error('На этом этапе поддерживаются только текстовые файлы TXT.');
  }

  const text = normalizeDocumentText(await file.text());
  if (!text) throw new Error('Файл не содержит текста.');

  return {
    name: file.name,
    text,
    mimeType: file.type || 'text/plain',
  };
}
