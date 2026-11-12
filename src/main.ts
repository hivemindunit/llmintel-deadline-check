import * as core from "@actions/core";
import {
  buildCatalogIndex,
  fetchCatalog,
  isDeadlineRelevant,
  lookupModels,
} from "./catalog";
import { readConfig } from "./config";
import {
  emitAnnotations,
  upsertPullRequestComment,
  upsertTrackingIssue,
  writeJobSummary,
} from "./github";
import { toDeadlineHits } from "./report";
import { scanWorkspace } from "./scan";

export async function run(): Promise<void> {
  const config = readConfig();
  core.info(`Fetching LLMIntel catalog from ${config.apiBase} …`);
  let models = await fetchCatalog(config.apiBase);
  if (config.providers) {
    models = models.filter((m) => config.providers!.has(m.provider));
  }

  const relevantCount = models.filter((m) => isDeadlineRelevant(m, config.daysAhead)).length;
  core.info(
    `Catalog: ${models.length} models, ${relevantCount} within ${config.daysAhead}-day deadline window.`,
  );

  // Index the full catalog so bare names resolve to the originating vendor (not a reseller's
  // retiring snapshot), then keep only deadline-relevant hits.
  const index = buildCatalogIndex(models);
  const scanHits = (
    await scanWorkspace({
      workspace: config.workspace,
      paths: config.paths,
      exclude: config.exclude,
      index,
    })
  ).filter((hit) => isDeadlineRelevant(hit.model, config.daysAhead));

  // Enrich only the models we actually found — one bulk lookup, not the whole catalog.
  const hitIds = [...new Set(scanHits.map((h) => h.model.id))];
  if (hitIds.length > 0) {
    try {
      const lookedUp = await lookupModels(config.apiBase, hitIds);
      for (const hit of scanHits) {
        const detail = lookedUp.get(hit.model.id);
        if (detail?.replacementId) {
          hit.model = { ...hit.model, replacementId: detail.replacementId };
        }
      }
    } catch (error) {
      core.warning(
        `Could not enrich replacements via /v1/models/lookup (${error instanceof Error ? error.message : String(error)}). Continuing without them.`,
      );
    }
  }

  const hits = toDeadlineHits(scanHits, config.failWithinDays);
  const distinctModels = new Set(hits.map((h) => h.model.id));

  core.setOutput("hit_count", String(hits.length));
  core.setOutput("model_count", String(distinctModels.size));

  emitAnnotations(hits, config.apiBase);
  await writeJobSummary(hits, config.apiBase);

  if (config.commentOnPr && config.githubToken) {
    try {
      await upsertPullRequestComment(config.githubToken, hits, config.apiBase);
    } catch (error) {
      core.warning(
        `PR comment failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (config.createIssue && config.githubToken) {
    try {
      await upsertTrackingIssue(
        config.githubToken,
        hits,
        config.apiBase,
        config.issueLabels,
      );
    } catch (error) {
      core.warning(
        `Tracking issue update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const failing = hits.some((h) => h.shouldFail);
  core.setOutput("failing", failing ? "true" : "false");

  if (failing) {
    const count = hits.filter((h) => h.shouldFail).length;
    core.setFailed(
      `${count} model deadline hit(s) fall within fail_within_days=${config.failWithinDays}.`,
    );
    return;
  }

  if (hits.length === 0) {
    core.info("No model deadline hits.");
  } else {
    core.warning(
      `Found ${hits.length} deadline hit(s) across ${distinctModels.size} model(s).`,
    );
  }
}

// Auto-run when executed as the Action entrypoint. Tests import helpers with VITEST=true.
if (process.env.VITEST !== "true") {
  run().catch((error: unknown) => {
    core.setFailed(error instanceof Error ? error.message : String(error));
  });
}
