import { describe, expect, it } from 'vitest';
import { normalizeDocumentText, readTextDocument } from './document-ingestion';

describe('document ingestion', () => {
  it('normalizes line endings and removes null bytes', () => {
    expect(normalizeDocumentText('  Суд\r\nуказал\u0000 факт.  \r\n')).toBe('  Суд\nуказал факт.');
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

  it('rejects empty TXT files', async () => {
    const file = new File(['   '], 'empty.txt', { type: 'text/plain' });
    await expect(readTextDocument(file)).rejects.toThrow('не содержит текста');
  });
});
