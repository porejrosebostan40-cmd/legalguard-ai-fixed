import type {
  AIProviderSet,
  ArbiterFinding,
  DeepSeekFinding,
} from '../core/legalguard.types';

const findings: DeepSeekFinding[] = [
  {
    id: 'DS-001',
    claim: 'Суд не дал надлежащей оценки существенному доводу защиты.',
    sourceQuote: 'Требуется проверить мотивировку судебного акта.',
    legalBasis: ['УПК РФ'],
    confidence: 0.91,
  },
  {
    id: 'DS-002',
    claim: 'В судебном акте имеется возможное противоречие в изложении фактов.',
    sourceQuote: 'Формулировки требуют сопоставления с материалами дела.',
    legalBasis: ['УПК РФ'],
    confidence: 0.64,
  },
  {
    id: 'DS-003',
    claim: 'Имеется предположение о процессуальном нарушении без достаточного подтверждения.',
    sourceQuote: 'Само по себе предположение недостаточно.',
    legalBasis: ['УПК РФ'],
    confidence: 0.38,
  },
];

export const mockProviders: AIProviderSet = {
  deepSeek: {
    async analyze(): Promise<DeepSeekFinding[]> {
      return findings;
    },
  },
  chatGPT: {
    async arbitrate(_documentText, input): Promise<ArbiterFinding[]> {
      return input.map((finding) => {
        if (finding.id === 'DS-001') {
          return {
            ...finding,
            status: 'accepted',
            legalSignificance: 'high',
            reasoning: 'Основание может иметь значение для проверки мотивированности судебного решения; требуется подтверждение по тексту акта.',
            appealCassationRelevance: 'Проверять как возможное существенное нарушение требований к мотивировке судебного решения.',
          };
        }
        if (finding.id === 'DS-002') {
          return {
            ...finding,
            status: 'needs_review',
            legalSignificance: 'medium',
            reasoning: 'Нужна сверка с материалами дела до включения в жалобу.',
          };
        }
        return {
          ...finding,
          status: 'rejected',
          legalSignificance: 'low',
          reasoning: 'Недостаточно подтверждений для самостоятельного юридического основания жалобы.',
        };
      });
    },
  },
};
