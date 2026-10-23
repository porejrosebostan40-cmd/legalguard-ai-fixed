import { describe, expect, it } from 'vitest';
import { normalizeDocumentText, readTextDocument } from './document-ingestion';

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

  it('rejects unsupported file types with a clear message', async () => {
    const file = new File(['content'], 'decision.rtf', { type: 'application/rtf' });
    await expect(readTextDocument(file)).rejects.toThrow('Формат файла не поддерживается');
  });

  it('rejects empty text files', async () => {
    const file = new File(['  \n  '], 'empty.txt', { type: 'text/plain' });
    await expect(readTextDocument(file)).rejects.toThrow('Файл не содержит извлекаемого текста');
  });
});
