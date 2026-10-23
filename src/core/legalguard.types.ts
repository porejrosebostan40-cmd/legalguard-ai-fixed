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
  sourceQuote?: string;
  sourceLineStart?: number;
  sourceLineEnd?: number;
}

export interface FinalControlResult {
  passed: boolean;
  blockingReasons: string[];
  warnings: string[];
  checkedFindingIds: string[];
}

export type PipelineStage = 'documents' | 'analyst' | 'legal-sources' | 'arbiter' | 'strategist' | 'stylist' | 'independent-review' | 'final-control';
export type TraceStatus = 'ok' | 'warning' | 'error' | 'rejected' | 'pending';

export interface PipelineTraceEntry {
  code: string;
  stage: PipelineStage;
  status: TraceStatus;
  message: string;
  timestamp: string;
}

export type AgentStatus = 'completed' | 'warning' | 'failed' | 'skipped';

export interface AgentAuditRecord {
  id: PipelineStage;
  name: string;
  status: AgentStatus;
  summary: string;
  inputSnapshot: string;
  outputSnapshot: string;
  beforeText?: string;
  afterText?: string;
  changes: string[];
  checks: { name: string; passed: boolean; detail: string }[];
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
  agentAudit: AgentAuditRecord[];
  readyForSubmission: boolean;
}

export interface PrimaryAnalyzer {
  analyze(documentText: string): Promise<DeepSeekFinding[]>;
}

export interface LegalArbiter {
  arbitrate(documentText: string, findings: DeepSeekFinding[]): Promise<ArbiterFinding[]>;
}

export interface AIProviderSet {
  analyst: PrimaryAnalyzer;
  arbiter: LegalArbiter;
}
