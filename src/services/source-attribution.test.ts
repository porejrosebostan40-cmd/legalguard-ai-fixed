import { describe, expect, it } from 'vitest';
import { combineDocuments } from './document-ingestion';
import { findSourceReference, hasDocumentBoundaryMarkers, isSourceReferenceGrounded } from './source-attribution';

describe('source attribution', () => {
  it('maps a quote to the unique uploaded document containing it', () => {
    const text = combineDocuments([
      { name: 'verdict.txt', text: 'Суд установил важное обстоятельство.', mimeType: 'text/plain' },
      { name: 'appeal.pdf', text: 'Заявитель оспаривает вывод.', mimeType: 'application/pdf' },
    ]);
    const source = findSourceReference(text, 'Суд установил важное обстоятельство.');
    expect(source).toEqual({ documentId: 'verdict.txt', quote: 'Суд установил важное обстоятельство.' });
    expect(isSourceReferenceGrounded(text, source)).toBe(true);
  });

  it('does not guess when the same quotation occurs in multiple uploaded documents', () => {
    const text = combineDocuments([
      { name: 'first.txt', text: 'Суд установил обстоятельство.', mimeType: 'text/plain' },
      { name: 'second.txt', text: 'Суд установил обстоятельство.', mimeType: 'text/plain' },
    ]);
    expect(findSourceReference(text, 'Суд установил обстоятельство.')).toBeUndefined();
  });

  it('never attributes a generated boundary label as evidence', () => {
    const text = combineDocuments([
      { name: 'verdict.txt', text: 'Решение суда.', mimeType: 'text/plain' },
    ]);
    const boundary = '=== НАЧАЛО ДОКУМЕНТА: verdict.txt ===';
    expect(hasDocumentBoundaryMarkers(text)).toBe(true);
    expect(findSourceReference(text, boundary)).toBeUndefined();
  });

  it('does not treat malformed combined-file markers as plain text', () => {
    const malformed = '=== НАЧАЛО ДОКУМЕНТА: verdict.txt ===\nСуд установил обстоятельство.';
    expect(findSourceReference(malformed, 'Суд установил обстоятельство.')).toBeUndefined();
    expect(isSourceReferenceGrounded(malformed, { documentId: 'Исходный материал', quote: 'Суд установил обстоятельство.' })).toBe(false);
  });

  it('attributes manually entered text without inventing a file name', () => {
    const source = findSourceReference('Суд установил обстоятельство.', 'Суд установил');
    expect(source?.documentId).toBe('Исходный материал');
    expect(isSourceReferenceGrounded('Суд установил обстоятельство.', source)).toBe(true);
  });
});
