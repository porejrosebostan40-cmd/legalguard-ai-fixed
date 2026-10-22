import type { SourceReference } from '../core/legalguard.types';

interface DocumentSection {
  documentId: string;
  text: string;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

function parseDocumentSections(documentText: string): DocumentSection[] {
  const pattern = /^=== НАЧАЛО ДОКУМЕНТА: (.*?) ===\r?\n([\s\S]*?)\r?\n=== КОНЕЦ ДОКУМЕНТА: \1 ===$/gm;
  return Array.from(documentText.matchAll(pattern), (match) => ({
    documentId: match[1],
    text: match[2],
  }));
}

export function hasDocumentBoundaryMarkers(documentText: string): boolean {
  return /^=== НАЧАЛО ДОКУМЕНТА: .* ===$/m.test(documentText);
}

/**
 * Resolves a model quotation to exactly one uploaded document.
 * Synthetic boundary labels are never considered evidence text.
 */
export function findSourceReference(documentText: string, quote: string): SourceReference | undefined {
  if (!quote.trim()) return undefined;
  const normalizedQuote = normalize(quote);
  const sections = parseDocumentSections(documentText);

  if (sections.length > 0) {
    const matches = sections.filter((section) => normalize(section.text).includes(normalizedQuote));
    if (matches.length !== 1) return undefined;
    return { documentId: matches[0].documentId, quote: quote.trim() };
  }

  if (normalize(documentText).includes(normalizedQuote)) {
    return { documentId: 'Исходный материал', quote: quote.trim() };
  }
  return undefined;
}

export function isSourceReferenceGrounded(documentText: string, source: SourceReference | undefined): boolean {
  if (!source || !source.documentId.trim() || !source.quote.trim()) return false;
  const normalizedQuote = normalize(source.quote);
  const sections = parseDocumentSections(documentText);

  if (sections.length > 0) {
    const matches = sections.filter((section) => normalize(section.text).includes(normalizedQuote));
    return matches.length === 1 && matches[0].documentId === source.documentId;
  }

  return source.documentId === 'Исходный материал' && normalize(documentText).includes(normalizedQuote);
}
