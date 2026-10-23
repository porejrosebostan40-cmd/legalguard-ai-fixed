import { beforeAll, describe, expect, it } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizeDocumentText, readTextDocument } from './document-ingestion';

function makePdf(textCommands = 'BT /F1 12 Tf 72 720 Td (LEGALGUARD PDF INGESTION TEST) Tj 0 -24 Td (Court decision article 125) Tj ET'): ArrayBuffer {
  const stream = textCommands;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const bytes = new TextEncoder().encode(pdf);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

beforeAll(() => {
  // Vitest runs in Node, where the Vite ?url worker import points to a browser-style path.
  // Resolve the installed PDF.js worker as a file URL for Node's fake-worker loader.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
});

describe('document ingestion', () => {
  it('normalizes line endings, removes a UTF-8 BOM, and trims outer whitespace', () => {
    expect(normalizeDocumentText('\uFEFF  Первая строка  \r\nВторая строка\r\n'))
      .toBe('Первая строка\nВторая строка');
  });

  it('reads a TXT file and assigns a canonical MIME type', async () => {
    const file = new File(['\uFEFF  Судебный акт.\r\nТекст решения.  '], 'decision.txt', {
      type: 'application/octet-stream',
    });

    await expect(readTextDocument(file)).resolves.toEqual({
      name: 'decision.txt',
      text: 'Судебный акт.\nТекст решения.',
      mimeType: 'text/plain',
    });
  });

  it('extracts real text from a PDF file even when the MIME type is generic', async () => {
    const file = new File([makePdf()], 'court-decision.pdf', { type: 'application/octet-stream' });

    await expect(readTextDocument(file)).resolves.toEqual({
      name: 'court-decision.pdf',
      text: 'LEGALGUARD PDF INGESTION TEST Court decision article 125',
      mimeType: 'application/pdf',
    });
  });

  it('gives a clear error for a valid PDF with no extractable text layer', async () => {
    const file = new File([makePdf('')], 'scanned-decision.pdf', { type: 'application/pdf' });
    await expect(readTextDocument(file)).rejects.toThrow('В PDF не найден текстовый слой');
  });

  it('rejects unsupported file types with a clear message', async () => {
    const file = new File(['content'], 'decision.rtf', { type: 'application/rtf' });
    await expect(readTextDocument(file)).rejects.toThrow('Формат файла не поддерживается');
  });

  it('rejects empty text files', async () => {
    const file = new File(['  \n  '], 'empty.txt', { type: 'text/plain' });
    await expect(readTextDocument(file)).rejects.toThrow('Файл не содержит извлекаемого текста');
  });
});
