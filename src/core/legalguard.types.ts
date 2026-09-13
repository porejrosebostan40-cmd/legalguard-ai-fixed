export type ComplaintType = 'апелляционная' | 'кассационная';
export type FindingStatus = 'pending' | 'accepted' | 'rejected' | 'needs_review';
export type LegalSignificance = 'high' | 'medium' | 'low' | 'none';

export interface CaseInfo {
  caseNumber: string;
  courtName: string;
  verdictDate: string;
  clientName: string;
  complaintType: ComplaintType;
}

export interface SourceReference {
  documentId: string;
  quote: string;
  startLine?: number;
  endLine?: number;
}

export interface DeepSeekFinding {
  id: string;
  claim: string;
  sourceQuote?: string;
  source?: SourceReference;
  legalBasis?: string[];
  confidence: number;
}

export interface ArbiterFinding extends DeepSeekFinding {
  status: FindingStatus;
  legalSignificance: LegalSignificance;
  reasoning: string;
  appealCassationRelevance?: string;
}

export interface StrategyArgument {
  findingId: string;
  position: number;
  heading: string;
  argument: string;
  requestedRelief?: string;
}

export interface FinalControlResult {
  passed: boolean;
  blockingReasons: string[];
  warnings: string[];
  checkedFindingIds: string[];
}

export type PipelineStage = 'documents' | 'analyst' | 'arbiter' | 'strategist' | 'final-control';
export type TraceStatus = 'ok' | 'warning' | 'error' | 'rejected' | 'pending';

export interface PipelineTraceEntry {
  code: string;
  stage: PipelineStage;
  status: TraceStatus;
  message: string;
  timestamp: string;
}

export interface LegalGuardResult {
  runId: string;
  findings: DeepSeekFinding[];
  arbiterFindings: ArbiterFinding[];
  strategy: StrategyArgument[];
  finalControl: FinalControlResult | null;
  finalDocument: string | null;
  trace: PipelineTraceEntry[];
  readyForSubmission: boolean;
}

export interface DeepSeekAnalyzer {
  analyze(documentText: string): Promise<DeepSeekFinding[]>;
}

export interface ChatGPTArbiter {
  arbitrate(documentText: string, findings: DeepSeekFinding[]): Promise<ArbiterFinding[]>;
}

export interface AIProviderSet {
  deepSeek: DeepSeekAnalyzer;
  chatGPT: ChatGPTArbiter;
}
