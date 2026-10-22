import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_CHARS, splitDocumentIntoChunks } from './document-chunking';

describe('document chunking', () => {
  it('keeps short documents as a single chunk', () => {
    expect(splitDocumentIntoChunks('Короткий судебный акт.')).toEqual(['Короткий судебный акт.']);
  });

  it('splits long text into bounded chunks without losing marker phrases', () => {
    const text = Array.from({ length: 80 }, (_, index) => `Фрагмент номер ${index + 1}. Суд установил обстоятельство.`).join('\n\n');
    const chunks = splitDocumentIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= MAX_CHUNK_CHARS)).toBe(true);
    for (let index = 1; index <= 80; index += 1) {
      expect(chunks.some((chunk) => chunk.includes(`Фрагмент номер ${index}.`))).toBe(true);
    }
  });

  it('rejects documents exceeding the safe chunk count instead of truncating them', () => {
    const text = 'слово '.repeat(28000);
    expect(() => splitDocumentIntoChunks(text, 2800, 2)).toThrow('превышает безопасный предел');
  });

  it('returns an empty list for blank input', () => {
    expect(splitDocumentIntoChunks('  \n  ')).toEqual([]);
  });
});
