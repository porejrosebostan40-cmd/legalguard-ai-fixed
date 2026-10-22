
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
export const MAX_EXTRACTED_DOCUMENT_CHARS = 84_000;
const MAX_PDF_PAGES = 300;
const MAX_DOCX_EXPANDED_BYTES = 40 * 1024 * 1024;
const MAX_DOCX_XML_BYTES = 8 * 1024 * 1024;

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
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });

  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF содержит более ${MAX_PDF_PAGES} страниц. Разделите документ на части.`);
    }

    const pages: string[] = [];
    let extractedChars = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      extractedChars += pageText.length;
      if (extractedChars > MAX_EXTRACTED_DOCUMENT_CHARS) {
        throw new Error('Извлечённый текст превышает безопасный предел 84 000 символов. Разделите документ на части.');
      }
      pages.push(`[Страница ${pageNumber}]\n${pageText}`);
    }

    const text = normalizeDocumentText(pages.join('\n\n'));
    if (!text || pages.every((page) => !page.replace(/\[Страница \d+\]/, '').trim())) {
      throw new Error('В PDF не найден текстовый слой. Возможно, это скан: OCR пока не поддерживается.');
    }
    return text;
  } finally {
    // PDF.js v6 exposes resource cleanup on the loading task, not PDFDocumentProxy.
    await loadingTask.destroy().catch(() => undefined);
  }
}

function inspectDocxZip(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read32 = (offset: number) => view.getUint32(offset, true);
  const read16 = (offset: number) => view.getUint16(offset, true);
  const searchStart = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (read32(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('DOCX не содержит корректного ZIP-каталога.');

  const commentLength = read16(eocd + 20);
  if (eocd + 22 + commentLength !== bytes.length) {
    throw new Error('DOCX содержит некорректную длину ZIP-комментария.');
  }

  const diskNumber = read16(eocd + 4);
  const centralDisk = read16(eocd + 6);
  const entriesOnDisk = read16(eocd + 8);
  const entryCount = read16(eocd + 10);
  const centralSize = read32(eocd + 12);
  const centralOffset = read32(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error('Многотомные DOCX/ZIP-архивы не поддерживаются.');
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 DOCX не поддерживается безопасным парсером.');
  }
  if (centralOffset + centralSize > eocd || centralOffset + centralSize > bytes.length) {
    throw new Error('DOCX содержит повреждённый ZIP-каталог.');
  }

  let offset = centralOffset;
  let expandedTotal = 0;
  let mainDocumentCount = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralOffset + centralSize || read32(offset) !== 0x02014b50) {
      throw new Error('DOCX содержит повреждённую запись ZIP-каталога.');
    }
    const flags = read16(offset + 8);
    const uncompressedSize = read32(offset + 24);
    const nameLength = read16(offset + 28);
    const extraLength = read16(offset + 30);
    const commentLength = read16(offset + 32);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralOffset + centralSize || uncompressedSize === 0xffffffff) {
      throw new Error('DOCX содержит неподдерживаемую или повреждённую ZIP-запись.');
    }
    if ((flags & 1) !== 0) throw new Error('Зашифрованные DOCX не поддерживаются.');
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    expandedTotal += uncompressedSize;
    if (expandedTotal > MAX_DOCX_EXPANDED_BYTES) {
      throw new Error('Распакованный DOCX превышает безопасный предел 40 МБ.');
    }
    if (name === 'word/document.xml') {
      mainDocumentCount += 1;
      if (uncompressedSize > MAX_DOCX_XML_BYTES) {
        throw new Error('Основной XML-текст DOCX превышает безопасный предел 8 МБ.');
      }
    }
    offset = entryEnd;
  }
  if (offset !== centralOffset + centralSize || mainDocumentCount !== 1) {
    throw new Error('DOCX должен содержать ровно одну корректную запись word/document.xml.');
  }
}

async function readDocx(file: File): Promise<string> {
  const { strFromU8, unzipSync } = await import('fflate');
  const bytes = new Uint8Array(await file.arrayBuffer());
  inspectDocxZip(bytes);
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new Error('Файл DOCX повреждён или не является корректным ZIP-документом.');
  }

  const documentXml = archive['word/document.xml'];
  if (!documentXml) throw new Error('В DOCX отсутствует основной текстовый документ.');
  if (documentXml.byteLength > MAX_DOCX_XML_BYTES) {
    throw new Error('Основной XML-текст DOCX превышает безопасный предел 8 МБ.');
  }

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
      else if (child.localName === 'tab') value += '\t';
      else if (child.localName === 'br' || child.localName === 'cr') value += '\n';
      else value += readNode(child);
    }
    return value;
  };
  const text = normalizeDocumentText(paragraphs.map(readNode).join('\n'));
  if (!text) throw new Error('В DOCX не найден извлекаемый текст.');
  if (text.length > MAX_EXTRACTED_DOCUMENT_CHARS) {
    throw new Error('Извлечённый текст превышает безопасный предел 84 000 символов. Разделите документ на части.');
  }
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
  if (text.length > MAX_EXTRACTED_DOCUMENT_CHARS) {
    throw new Error('Извлечённый текст превышает безопасный предел 84 000 символов. Разделите документ на части.');
  }
  return { name: file.name, text, mimeType };
}

/**
 * Combines separately extracted case materials while preserving explicit boundaries
 * so quotes can be traced back to the file they came from.
 */
export function combineDocuments(documents: DocumentInput[]): string {
  const combined = documents.map((document) => {
    const safeName = document.name.replace(/[\r\n]+/g, ' ').trim() || 'Документ без имени';
    return `=== НАЧАЛО ДОКУМЕНТА: ${safeName} ===\n${document.text}\n=== КОНЕЦ ДОКУМЕНТА: ${safeName} ===`;
  }).join('\n\n');
  if (combined.length > MAX_EXTRACTED_DOCUMENT_CHARS) {
    throw new Error('Общий извлечённый текст превышает безопасный предел 84 000 символов. Разделите материалы на несколько запусков.');
  }
  return combined;
}
