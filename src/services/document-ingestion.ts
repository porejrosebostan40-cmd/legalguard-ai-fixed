import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;

export interface DocumentInput {
  name: string;
  text: string;
  mimeType: string;
}

export function normalizeDocumentText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replaceAll('\u0000', '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

async function readPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const parts = content.items.map((item) => {
        if (!('str' in item) || typeof item.str !== 'string') return '';
        const hasEndOfLine = 'hasEOL' in item && item.hasEOL;
        return item.str + (hasEndOfLine ? '\n' : ' ');
      });
      pages.push(parts.join(''));
    }
  } finally {
    await pdf.destroy();
  }

  const text = normalizeDocumentText(pages.join('\n\n'));
  if (!text) {
    throw new Error('В PDF не найден текстовый слой. Вероятно, это скан: в текущей версии OCR не поддерживается.');
  }
  return text;
}

async function readDocx(file: File): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = normalizeDocumentText(result.value);
  if (!text) throw new Error('В DOCX не удалось извлечь текст.');
  return text;
}

export async function readTextDocument(file: File): Promise<DocumentInput> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Файл превышает 30 МБ. Уменьшите размер или разделите документ на части, чтобы избежать нехватки памяти на телефоне.');
  }

  // Android document providers may report a generic MIME type or omit it entirely.
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
  const detectedType = (file.type || '').toLowerCase();
  const isPdf = extension === 'pdf' || detectedType === 'application/pdf';
  const isDocx = extension === 'docx' || detectedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isTxt = extension === 'txt' || detectedType === 'text/plain';

  let text: string;
  let mimeType: string;

  try {
    if (isTxt) {
      text = normalizeDocumentText(await file.text());
      mimeType = 'text/plain';
    } else if (isPdf) {
      text = await readPdf(file);
      mimeType = 'application/pdf';
    } else if (isDocx) {
      text = await readDocx(file);
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      throw new Error('Формат файла не поддерживается. Выберите TXT, PDF с текстовым слоем или DOCX.');
    }
  } catch (cause) {
    if (cause instanceof Error && (
      cause.message.startsWith('Формат файла не поддерживается') ||
      cause.message.startsWith('В PDF не найден текстовый слой') ||
      cause.message.startsWith('В DOCX не удалось извлечь текст.')
    )) {
      throw cause;
    }
    const detail = cause instanceof Error ? cause.message : 'неизвестная ошибка чтения';
    throw new Error('Не удалось извлечь текст из файла «' + file.name + '»: ' + detail);
  }

  if (!text) throw new Error('Файл не содержит извлекаемого текста.');

  return { name: file.name, text, mimeType };
}
