import type {
  AIProviderSet,
  ArbiterFinding,
  DeepSeekFinding,
} from '../core/legalguard.types';

type Rule = { label: string; pattern: RegExp };

// These rules locate text passages for human review. They do not infer legal violations.
const rules: Rule[] = [
  { label: 'Судебный вывод об отсутствии оснований для УДО', pattern: /(?:не усматривает|не находит|приходит к выводу|считает необходимым).{0,180}(?:основан|удовлетвор|условно-досроч|удо|освобожд)/i },
  { label: 'Ссылка на цели наказания или социальную справедливость', pattern: /(?:цели наказания|социальн(?:ой|ую) справедливост|исправлени[яю]|предупреждени[ея] совершения преступлен)/i },
  { label: 'Упоминание поведения и характеристики осуждённого', pattern: /(?:характеристик[аеуи]|поведени[ея]|встал на путь исправлен|отношени[ея] к труду|отношени[ея] к обучени)/i },
  { label: 'Упоминание поощрений', pattern: /(?:поощрени[еяй]|благодарност[ьи])/i },
  { label: 'Упоминание взысканий или нарушений режима', pattern: /(?:взыскани[еяй]|нарушени[ея] режим|дисциплинарн(?:ое|ого|ых) взыскан)/i },
  { label: 'Упоминание возмещения вреда или исковых обязательств', pattern: /(?:возмещени[ея] вреда|гражданск(?:ий|ого) иск|исков(?:ые|ых) обязательств|алименты|материальн(?:ый|ого) ущерб)/i },
  { label: 'Ссылка на норму об условно-досрочном освобождении', pattern: /(?:ст(?:атья|\.)\s*79\s*ук\s*рф|стать[еяи]\s+79\s+ук|част[ьи]\s*\d+\s+ст(?:атьи|\.)\s*79)/i },
  { label: 'Формулировка о необходимости дальнейшего отбывания наказания', pattern: /(?:нуждается|не нуждается|дальнейш(?:ем|его) отбывани[ея] наказани|цели наказания не достигнут)/i },
  { label: 'Оценка исправления или степени исправления', pattern: /(?:степен[ьи] исправлен|исправлени[ея] осуждённого|исправлени[ея] осужденного)/i },
  { label: 'Ссылка на мнение администрации учреждения или прокурора', pattern: /(?:администраци[ея] исправительн|мнение прокурора|позици[ея] прокурора|представител[ья] администрации)/i },
];

const MAX_FINDINGS = 80;

function splitIntoPassages(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18);
}

export const textReviewProviders: AIProviderSet = {
  analyst: {
    async analyze(documentText: string): Promise<DeepSeekFinding[]> {
      const passages = splitIntoPassages(documentText);
      const findings: DeepSeekFinding[] = [];
      const seen = new Set<string>();

      for (const rule of rules) {
        for (const passage of passages) {
          if (!rule.pattern.test(passage)) continue;

          const maxQuoteLength = 650;
          const quote = passage.length > maxQuoteLength
            ? passage.slice(0, Math.max(passage.lastIndexOf(' ', maxQuoteLength), 1))
            : passage;
          const normalizedQuote = quote.replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
          const key = rule.label + '|' + normalizedQuote;
          if (seen.has(key)) continue;
          seen.add(key);

          const index = documentText.indexOf(quote);
          const startLine = index >= 0 ? documentText.slice(0, index).split('\n').length : undefined;
          const endLine = startLine !== undefined ? startLine + quote.split('\n').length - 1 : undefined;

          findings.push({
            id: 'TXT-' + String(findings.length + 1).padStart(3, '0'),
            claim: rule.label,
            sourceQuote: quote,
            source: {
              documentId: 'current-document',
              quote,
              ...(startLine !== undefined ? { startLine, endLine } : {}),
            },
            confidence: 1,
            legalBasis: [],
          });

          if (findings.length >= MAX_FINDINGS) return findings;
        }
      }

      return findings;
    },
  },
  arbiter: {
    async arbitrate(_documentText: string, findings: DeepSeekFinding[]): Promise<ArbiterFinding[]> {
      return findings.map((finding) => ({
        ...finding,
        status: 'needs_review',
        legalSignificance: 'none',
        reasoning: 'Автоматически найден фрагмент по текстовому признаку. Это не вывод о нарушении закона; юристу необходимо проверить контекст, материалы дела и применимые нормы.',
      }));
    },
  },
};
