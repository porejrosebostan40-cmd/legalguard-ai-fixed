export interface DocumentInput {
  name: string;
  text: string;
  mimeType: string;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

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
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    pages.push(`[Страница ${pageNumber}]\n${pageText}`);
  }

  const text = normalizeDocumentText(pages.join('\n\n'));
  if (!text || pages.every((page) => !page.replace(/\[Страница \d+\]/, '').trim())) {
    throw new Error('В PDF не найден текстовый слой. Возможно, это скан: OCR пока не поддерживается.');
  }
  return text;
}

async function readDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = normalizeDocumentText(result.value);
  if (!text) throw new Error('В DOCX не найден извлекаемый текст.');
  return text;
}

export async function readTextDocument(file: File): Promise<DocumentInput> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Файл превышает лимит 20 МБ. Разделите материал на части и загрузите их отдельно.');
  }

  const extension = file.name.split('.').pop()?.toLocaleLowerCase('en-US');
  let text: string;
  let mimeType: string;

  if (extension === 'txt') {
    text = normalizeDocumentText(await file.text());
    mimeType = 'text/plain';
  } else if (extension === 'pdf') {
    text = await readPdf(file);
    mimeType = 'application/pdf';
  } else if (extension === 'docx') {
    text = await readDocx(file);
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else {
    throw new Error('Поддерживаются TXT, PDF и DOCX. Сканированные PDF без текстового слоя пока не распознаются.');
  }

  if (!text) throw new Error('Файл не содержит текста.');
  return { name: file.name, text, mimeType };
}
