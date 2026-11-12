import type { CatalogModel, LifecycleState, Provider } from "./types";
import { LIFECYCLE_STATES, PROVIDERS } from "./types";

interface ListResponse {
  data?: Array<{
    id: string;
    provider: string;
    displayName: string;
    aliases?: string[];
    lifecycleState: string;
    announcedDate: string | null;
    deprecatedDate: string | null;
    retirementDate: string | null;
    retirementDateIsEarliest?: boolean;
  }>;
  count?: number;
}

interface LookupResponse {
  data?: Array<{
    ref: string;
    model: {
      id: string;
      provider: string;
      displayName: string;
      aliases?: string[];
      lifecycleState: string;
      announcedDate: string | null;
      deprecatedDate: string | null;
      retirementDate: string | null;
      retirementDateIsEarliest?: boolean;
      replacementId?: string | null;
    } | null;
  }>;
}

function isLifecycleState(value: string): value is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(value);
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

function normalizeModel(row: {
  id: string;
  provider: string;
  displayName: string;
  aliases?: string[];
  lifecycleState: string;
  announcedDate: string | null;
  deprecatedDate: string | null;
  retirementDate: string | null;
  retirementDateIsEarliest?: boolean;
  replacementId?: string | null;
}): CatalogModel | null {
  if (!isLifecycleState(row.lifecycleState) || !isProvider(row.provider)) return null;
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    aliases: row.aliases ?? [],
    lifecycleState: row.lifecycleState,
    announcedDate: row.announcedDate,
    deprecatedDate: row.deprecatedDate,
    retirementDate: row.retirementDate,
    retirementDateIsEarliest: row.retirementDateIsEarliest,
    replacementId: row.replacementId ?? null,
  };
}

/**
 * Download the full public catalog (paginated). Prefer this over per-id lookups so only model-id
 * candidates are matched locally and source code never leaves the runner.
 */
export async function fetchCatalog(
  apiBase: string,
  options: { fetchImpl?: typeof fetch; pageSize?: number } = {},
): Promise<CatalogModel[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = options.pageSize ?? 500;
  const base = apiBase.replace(/\/$/, "");
  const models: CatalogModel[] = [];
  let offset = 0;

  for (;;) {
    const url = `${base}/v1/models?limit=${pageSize}&offset=${offset}`;
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "llmintel-deadline-check" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch LLMIntel catalog (${response.status}): ${url}`);
    }
    const body = (await response.json()) as ListResponse;
    const page = (body.data ?? [])
      .map((row) => normalizeModel(row))
      .filter((row): row is CatalogModel => row !== null);
    models.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return models;
}

/**
 * Optional bulk lookup for a set of refs. Used by tests and as a fallback when a custom API only
 * exposes lookup; the Action itself prefers {@link fetchCatalog}.
 */
export async function lookupModels(
  apiBase: string,
  refs: string[],
  options: { fetchImpl?: typeof fetch } = {},
): Promise<Map<string, CatalogModel>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = apiBase.replace(/\/$/, "");
  const unique = [...new Set(refs.map((r) => r.trim()).filter(Boolean))];
  const result = new Map<string, CatalogModel>();
  if (unique.length === 0) return result;

  // Chunk to stay under typical URL length / server caps (100).
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const url = `${base}/v1/models/lookup?ids=${chunk.map(encodeURIComponent).join(",")}`;
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "llmintel-deadline-check" },
    });
    if (!response.ok) {
      throw new Error(`Failed to lookup models (${response.status}): ${url}`);
    }
    const body = (await response.json()) as LookupResponse;
    for (const entry of body.data ?? []) {
      if (!entry.model) continue;
      const model = normalizeModel(entry.model);
      if (model) result.set(entry.ref, model);
    }
  }

  return result;
}

/** True when `model.id` is the canonical owner of bare reference `key` (e.g. openai/gpt-4o owns gpt-4o). */
function ownsBareKey(model: CatalogModel, key: string): boolean {
  if (key.includes("/")) return model.id === key;
  return model.id === key || model.id.endsWith(`/${key}`);
}

/**
 * Index every callable reference for a model (canonical id, bare suffix, aliases) so a scan can
 * resolve whatever string the developer actually wrote in code.
 *
 * Shared bare aliases (Azure often registers `gpt-4o` first) must not steal the name from the
 * originating vendor's canonical row — otherwise a repo that calls OpenAI's active `gpt-4o` gets a
 * false Azure retirement warning. Canonical ids always win for their own key; for bare names the
 * model whose id ends with `/key` wins over a reseller that only holds the alias row.
 */
export function buildCatalogIndex(models: CatalogModel[]): Map<string, CatalogModel> {
  const index = new Map<string, CatalogModel>();

  const add = (key: string, model: CatalogModel): void => {
    const normalized = key.trim();
    if (!normalized) return;
    const existing = index.get(normalized);
    if (!existing) {
      index.set(normalized, model);
      return;
    }
    if (model.id === normalized) {
      index.set(normalized, model);
      return;
    }
    if (ownsBareKey(model, normalized) && !ownsBareKey(existing, normalized)) {
      index.set(normalized, model);
    }
  };

  for (const model of models) {
    add(model.id, model);
    const slash = model.id.indexOf("/");
    if (slash >= 0) add(model.id.slice(slash + 1), model);
    for (const alias of model.aliases) add(alias, model);
  }

  return index;
}

/** Whole days from UTC today until an ISO date. Negative when past. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

/**
 * Whether a catalog model should surface as a deadline warning given days_ahead.
 * Retired models always surface (they are already past); active models without a date do not.
 */
export function isDeadlineRelevant(
  model: CatalogModel,
  daysAhead: number,
  now: Date = new Date(),
): boolean {
  if (model.lifecycleState === "retired") return true;
  if (
    model.lifecycleState === "deprecated" ||
    model.lifecycleState === "retiring" ||
    model.lifecycleState === "legacy"
  ) {
    if (!model.retirementDate) return true;
    return daysUntil(model.retirementDate, now) <= daysAhead;
  }
  if (model.retirementDate) {
    return daysUntil(model.retirementDate, now) <= daysAhead;
  }
  return false;
}
