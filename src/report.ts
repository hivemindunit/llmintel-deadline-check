import type { DeadlineHit } from "./types";
import { daysUntil } from "./catalog";

const UTM = "utm_source=github-action&utm_medium=ci&utm_campaign=deadline-check";

export function modelPageUrl(apiBase: string, modelId: string): string {
  const base = apiBase.replace(/\/$/, "");
  return `${base}/models/${modelId.split("/").map(encodeURIComponent).join("/")}?${UTM}`;
}

export function alertsUrl(apiBase: string): string {
  const base = apiBase.replace(/\/$/, "");
  return `${base}/retirement-alerts?${UTM}`;
}

/** Promote scan hits into deadline hits with countdown + fail flag. */
export function toDeadlineHits(
  hits: Array<{
    matchedText: string;
    model: DeadlineHit["model"];
    file: string;
    line: number;
    column: number;
  }>,
  failWithinDays: number | null,
  now: Date = new Date(),
): DeadlineHit[] {
  return hits.map((hit) => {
    const daysRemaining = hit.model.retirementDate
      ? daysUntil(hit.model.retirementDate, now)
      : hit.model.lifecycleState === "retired"
        ? -1
        : null;

    let shouldFail = false;
    if (failWithinDays !== null) {
      if (hit.model.lifecycleState === "retired") shouldFail = true;
      else if (daysRemaining !== null && daysRemaining <= failWithinDays) shouldFail = true;
    }

    return { ...hit, daysRemaining, shouldFail };
  });
}

function deadlineLabel(hit: DeadlineHit): string {
  if (hit.model.lifecycleState === "retired") return "retired";
  if (hit.daysRemaining === null) return hit.model.lifecycleState;
  if (hit.daysRemaining < 0) return `past due (${hit.model.lifecycleState})`;
  if (hit.daysRemaining === 0) return "retires today";
  const unit = hit.daysRemaining === 1 ? "day" : "days";
  return `retires in ${hit.daysRemaining} ${unit}`;
}

/** Markdown body shared by the job summary, PR comment, and tracking issue. */
export function formatMarkdownReport(
  hits: DeadlineHit[],
  apiBase: string,
): string {
  const lines: string[] = [
    "## Model deadlines found by LLMIntel",
    "",
  ];

  if (hits.length === 0) {
    lines.push("No deprecated or retiring model ids found in the scanned paths.", "");
    lines.push(
      `Get free retirement alerts: [llmintel.ai/retirement-alerts](${alertsUrl(apiBase)})`,
    );
    return lines.join("\n");
  }

  lines.push(
    `Found **${hits.length}** location(s) referencing model ids that are deprecated, retiring, or retired.`,
    "",
  );
  lines.push("| Model | State | Deadline | Replacement | Location |");
  lines.push("| --- | --- | --- | --- | --- |");

  const sorted = [...hits].sort((a, b) => {
    const da = a.daysRemaining ?? 99999;
    const db = b.daysRemaining ?? 99999;
    if (da !== db) return da - db;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });

  for (const hit of sorted) {
    const modelLink = `[${hit.model.id}](${modelPageUrl(apiBase, hit.model.id)})`;
    const state = hit.model.lifecycleState;
    const deadline = deadlineLabel(hit);
    const replacement = hit.model.replacementId
      ? `[${hit.model.replacementId}](${modelPageUrl(apiBase, hit.model.replacementId)})`
      : "—";
    const location = `\`${hit.file}:${hit.line}\``;
    lines.push(`| ${modelLink} | ${state} | ${deadline} | ${replacement} | ${location} |`);
  }

  lines.push(
    "",
    `Get free retirement alerts: [llmintel.ai/retirement-alerts](${alertsUrl(apiBase)})`,
    "",
    "<!-- llmintel-deadline-check -->",
  );
  return lines.join("\n");
}

/** Checklist body for the tracking issue (draft scope). */
export function formatIssueBody(hits: DeadlineHit[], apiBase: string): string {
  const lines: string[] = [
    "Model ids found in this repository that LLMIntel shows as deprecated, retiring, or retired.",
    "",
    "Code never left the runner — only model-id candidates were matched against the public catalog.",
    "",
  ];

  if (hits.length === 0) {
    lines.push("_No open deadlines._");
    lines.push("");
    lines.push(`<!-- llmintel-deadline-check -->`);
    return lines.join("\n");
  }

  const sorted = [...hits].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  for (const hit of sorted) {
    const deadline = deadlineLabel(hit);
    const replacement = hit.model.replacementId ? ` → migrate to \`${hit.model.replacementId}\`` : "";
    lines.push(
      `- [ ] \`${hit.matchedText}\` in \`${hit.file}:${hit.line}\` — ${deadline} ([${hit.model.id}](${modelPageUrl(apiBase, hit.model.id)}))${replacement}`,
    );
  }

  lines.push(
    "",
    `Get free retirement alerts: [llmintel.ai/retirement-alerts](${alertsUrl(apiBase)})`,
    "",
    "<!-- llmintel-deadline-check -->",
  );
  return lines.join("\n");
}

export const ISSUE_TITLE = "Model deadlines found by LLMIntel";
export const MARKER = "<!-- llmintel-deadline-check -->";
