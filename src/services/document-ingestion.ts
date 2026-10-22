
export function validateDocumentBatch(files: Array<Pick<File, 'name' | 'size'>>): void {
  if (files.length > MAX_BATCH_FILES) {
    throw new Error(`За один запуск можно загрузить не более ${MAX_BATCH_FILES} документов.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_BATCH_BYTES) {
    throw new Error('Суммарный размер загружаемых документов превышает 50 МБ.');
  }
}

export interface DocumentInput {
  name: string;
  text: string;
  mimeType: string;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH_FILES = 10;
export const MAX_BATCH_BYTES = 50 * 1024 * 1024;

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
  const { strFromU8, unzipSync } = await import('fflate');
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('Файл DOCX повреждён или не является корректным ZIP-документом.');
  }

  const documentXml = archive['word/document.xml'];
  if (!documentXml) throw new Error('В DOCX отсутствует основной текстовый документ.');

  const xml = new DOMParser().parseFromString(strFromU8(documentXml), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Не удалось разобрать XML внутри DOCX.');
  }

  const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs = Array.from(xml.getElementsByTagNameNS(wordNamespace, 'p'));
  const readNode = (node: Element): string => {
    let value = '';
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI !== wordNamespace) continue;
      if (child.localName === 't') value += child.textContent ?? '';
      else if (child.localName === 'tab') value += '\\t';
      else if (child.localName === 'br' || child.localName === 'cr') value += '\\n';
      else value += readNode(child);
    }
    return value;
  };
  const text = normalizeDocumentText(paragraphs.map(readNode).join('\\n'));
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

/**
 * Combines separately extracted case materials while preserving explicit boundaries
 * so quotes can be traced back to the file they came from.
 */
export function combineDocuments(documents: DocumentInput[]): string {
  return documents.map((document) => {
    const safeName = document.name.replace(/[\r\n]+/g, ' ').trim() || 'Документ без имени';
    return `=== НАЧАЛО ДОКУМЕНТА: ${safeName} ===\n${document.text}\n=== КОНЕЦ ДОКУМЕНТА: ${safeName} ===`;
  }).join('\n\n');
}
