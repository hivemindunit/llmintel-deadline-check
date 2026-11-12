/** Public library surface for tests and future CLI wrappers. */
export {
  buildCatalogIndex,
  daysUntil,
  fetchCatalog,
  isDeadlineRelevant,
  lookupModels,
} from "./catalog";
export {
  formatIssueBody,
  formatMarkdownReport,
  modelPageUrl,
  toDeadlineHits,
} from "./report";
export { isBoundedMatch, positionAt, scanContent, scanWorkspace } from "./scan";
export type {
  ActionConfig,
  CatalogModel,
  DeadlineHit,
  LifecycleState,
  Provider,
  ScanHit,
} from "./types";
