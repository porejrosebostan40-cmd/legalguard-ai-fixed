import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

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

async function readPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      pages.push(pageText);
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
  const extension = file.name.split('.').pop()?.toLowerCase();
  let text: string;
  let mimeType = file.type || 'application/octet-stream';

  if (extension === 'txt') {
    text = normalizeDocumentText(await file.text());
    mimeType = file.type || 'text/plain';
  } else if (extension === 'pdf') {
    text = await readPdf(file);
    mimeType = file.type || 'application/pdf';
  } else if (extension === 'docx') {
    text = await readDocx(file);
    mimeType = file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else {
    throw new Error('Поддерживаются файлы TXT, текстовые PDF и DOCX. Сканированные PDF пока требуют OCR.');
  }

  if (!text) throw new Error('Файл не содержит извлекаемого текста.');

  return { name: file.name, text, mimeType };
}
