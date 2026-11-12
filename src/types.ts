/** Lifecycle states returned by the public LLMIntel catalog. */
export const LIFECYCLE_STATES = [
  "announced",
  "active",
  "legacy",
  "deprecated",
  "retiring",
  "retired",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const PROVIDERS = [
  "openai",
  "anthropic",
  "azure",
  "bedrock",
  "google",
  "vertex",
  "mistral",
  "cohere",
] as const;

export type Provider = (typeof PROVIDERS)[number];

/** One row from GET /v1/models (plus the primary replacement when available). */
export interface CatalogModel {
  id: string;
  provider: string;
  displayName: string;
  aliases: string[];
  lifecycleState: LifecycleState;
  announcedDate: string | null;
  deprecatedDate: string | null;
  retirementDate: string | null;
  retirementDateIsEarliest?: boolean;
  /** Primary recommended replacement id, when the catalog includes one. */
  replacementId?: string | null;
}

/** A model id found at a specific file location. */
export interface ScanHit {
  matchedText: string;
  model: CatalogModel;
  file: string;
  line: number;
  column: number;
}

export interface DeadlineHit extends ScanHit {
  /** Whole days until retirement; null when unknown; negative when past. */
  daysRemaining: number | null;
  /** True when this hit should fail the job under fail_within_days. */
  shouldFail: boolean;
}

export interface ActionConfig {
  daysAhead: number;
  failWithinDays: number | null;
  providers: Set<string> | null;
  paths: string[];
  exclude: string[];
  apiBase: string;
  commentOnPr: boolean;
  createIssue: boolean;
  issueLabels: string[];
  githubToken: string;
  workspace: string;
}
