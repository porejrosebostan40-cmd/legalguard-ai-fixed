import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { combineDocuments, MAX_BATCH_BYTES, MAX_BATCH_FILES, normalizeDocumentText, readTextDocument, validateDocumentBatch } from './document-ingestion';

const { pdfMock } = vi.hoisted(() => ({ pdfMock: { empty: false } }));

function makeDocxZip(): Uint8Array {
  const name = new TextEncoder().encode('word/document.xml');
  const xml = new TextEncoder().encode('<w:document />');
  const centralSize = 46 + name.length;
  const eocdOffset = centralSize;
  const bytes = new Uint8Array(centralSize + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint32(24, xml.length, true);
  view.setUint16(28, name.length, true);
  bytes.set(name, 46);
  view.setUint32(eocdOffset, 0x06054b50, true);
  view.setUint16(eocdOffset + 8, 1, true);
  view.setUint16(eocdOffset + 10, 1, true);
  view.setUint32(eocdOffset + 12, centralSize, true);
  view.setUint32(eocdOffset + 16, 0, true);
  return bytes;
}

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: pdfMock.empty ? [] : [{ str: 'Текст из PDF' }],
        }),
      }),
    }),
  }),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/worker.js' }));
vi.mock('fflate', () => ({
  unzipSync: () => ({
    'word/document.xml': new TextEncoder().encode(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Текст из DOCX</w:t></w:r></w:p></w:body></w:document>',
    ),
  }),
  strFromU8: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}));

describe('document ingestion', () => {
  beforeEach(() => {
    pdfMock.empty = false;
    const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const textNode = { namespaceURI: wordNamespace, localName: 't', textContent: 'Текст из DOCX', children: [] };
    const secondTextNode = { namespaceURI: wordNamespace, localName: 't', textContent: 'часть', children: [] };
    const finalTextNode = { namespaceURI: wordNamespace, localName: 't', textContent: 'Вторая строка', children: [] };
    const thirdTextNode = { namespaceURI: wordNamespace, localName: 't', textContent: 'Третья строка', children: [] };
    const runNode = { namespaceURI: wordNamespace, localName: 'r', children: [textNode] };
    const secondRunNode = { namespaceURI: wordNamespace, localName: 'r', children: [thirdTextNode] };
    const tabNode = { namespaceURI: wordNamespace, localName: 'tab', children: [] };
    const breakNode = { namespaceURI: wordNamespace, localName: 'br', children: [] };
    const firstParagraph = { namespaceURI: wordNamespace, localName: 'p', children: [runNode, tabNode, secondTextNode, breakNode, finalTextNode] };
    const secondParagraph = { namespaceURI: wordNamespace, localName: 'p', children: [secondRunNode] };
    vi.stubGlobal('DOMParser', class {
      parseFromString() {
        return {
          getElementsByTagName: () => [],
          getElementsByTagNameNS: (_namespace: string, localName: string) => localName === 'p' ? [firstParagraph, secondParagraph] : [],
        };
      }
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('normalizes line endings and removes null bytes', () => {
    expect(normalizeDocumentText('  Суд\r\nуказал\u0000 факт.  \r\n')).toBe('Суд\nуказал факт.');
  });

  it('reads plain TXT files', async () => {
    const file = new File(['Суд указал факт.\r\n'], 'decision.txt', { type: 'text/plain' });
    const result = await readTextDocument(file);
    expect(result.name).toBe('decision.txt');
    expect(result.mimeType).toBe('text/plain');
    expect(result.text).toBe('Суд указал факт.');
  });

  it('rejects unsupported file types clearly', async () => {
    const file = new File(['binary'], 'decision.doc', { type: 'application/msword' });
    await expect(readTextDocument(file)).rejects.toThrow('Поддерживаются TXT, PDF и DOCX');
  });

  it('extracts PDF text and preserves a page marker', async () => {
    const file = new File(['pdf bytes'], 'decision.pdf', { type: 'application/pdf' });
    const result = await readTextDocument(file);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.text).toContain('[Страница 1]');
    expect(result.text).toContain('Текст из PDF');
  });

  it('rejects scanned PDFs when no text layer is present', async () => {
    pdfMock.empty = true;
    const file = new File(['pdf bytes'], 'scan.pdf', { type: 'application/pdf' });
    await expect(readTextDocument(file)).rejects.toThrow('OCR пока не поддерживается');
  });

  it('extracts text from DOCX files', async () => {
    const file = new File([makeDocxZip()], 'decision.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = await readTextDocument(file);
    expect(result.mimeType).toContain('wordprocessingml.document');
    expect(result.text).toBe('Текст из DOCX\tчасть\nВторая строка\nТретья строка');
  });

  it('rejects malformed DOCX archive data', async () => {
    const file = new File(['not a zip archive'], 'broken.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await expect(readTextDocument(file)).rejects.toThrow('корректного ZIP-каталога');
  });

  it('combines multiple files with explicit, sanitized document boundaries', () => {
    const combined = combineDocuments([
      { name: 'verdict.txt', text: 'Текст приговора.', mimeType: 'text/plain' },
      { name: 'appeal\nreview.pdf', text: 'Текст апелляции.', mimeType: 'application/pdf' },
    ]);
    expect(combined).toContain('=== НАЧАЛО ДОКУМЕНТА: verdict.txt ===');
    expect(combined).toContain('=== КОНЕЦ ДОКУМЕНТА: verdict.txt ===');
    expect(combined).toContain('=== НАЧАЛО ДОКУМЕНТА: appeal review.pdf ===');
    expect(combined).toContain('Текст апелляции.');
  });

  it('limits the number of uploaded documents', () => {
    const files = Array.from({ length: MAX_BATCH_FILES + 1 }, (_, index) => ({ name: `file-${index}.txt`, size: 1 }));
    expect(() => validateDocumentBatch(files)).toThrow('не более 10 документов');
  });

  it('limits the combined upload size', () => {
    expect(() => validateDocumentBatch([
      { name: 'a.pdf', size: MAX_BATCH_BYTES / 2 },
      { name: 'b.pdf', size: MAX_BATCH_BYTES / 2 + 1 },
    ])).toThrow('превышает 50 МБ');
  });

  it('rejects empty TXT files', async () => {
    const file = new File(['   '], 'empty.txt', { type: 'text/plain' });
    await expect(readTextDocument(file)).rejects.toThrow('не содержит текста');
  });
});
