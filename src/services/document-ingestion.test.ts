import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeDocumentText, readTextDocument } from './document-ingestion';

const { pdfMock } = vi.hoisted(() => ({ pdfMock: { empty: false } }));

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
vi.mock('mammoth/mammoth.browser', () => ({
  extractRawText: async () => ({ value: 'Текст из DOCX', messages: [] }),
}));

describe('document ingestion', () => {
  beforeEach(() => { pdfMock.empty = false; });
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
    const file = new File(['docx bytes'], 'decision.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = await readTextDocument(file);
    expect(result.mimeType).toContain('wordprocessingml.document');
    expect(result.text).toBe('Текст из DOCX');
  });

  it('rejects empty TXT files', async () => {
    const file = new File(['   '], 'empty.txt', { type: 'text/plain' });
    await expect(readTextDocument(file)).rejects.toThrow('не содержит текста');
  });
});
