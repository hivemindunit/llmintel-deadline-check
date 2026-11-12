import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  formatIssueBody,
  formatMarkdownReport,
  ISSUE_TITLE,
  MARKER,
  modelPageUrl,
} from "./report";
import type { DeadlineHit } from "./types";

/** Emit a GitHub Actions annotation per hit (file:line visible in the Checks UI). */
export function emitAnnotations(hits: DeadlineHit[], apiBase: string): void {
  for (const hit of hits) {
    const replacement = hit.model.replacementId
      ? ` Recommended: ${hit.model.replacementId}.`
      : "";
    const days =
      hit.daysRemaining === null
        ? hit.model.lifecycleState
        : hit.daysRemaining < 0
          ? "already past retirement"
          : hit.daysRemaining === 0
            ? "retires today"
            : `retires in ${hit.daysRemaining} day(s)`;
    const message = `${hit.model.id} is ${hit.model.lifecycleState} (${days}).${replacement} ${modelPageUrl(apiBase, hit.model.id)}`;

    const annotation = {
      file: hit.file,
      startLine: hit.line,
      startColumn: hit.column,
      title: `LLMIntel: ${hit.model.id}`,
    };

    if (hit.shouldFail || hit.model.lifecycleState === "retired" || (hit.daysRemaining !== null && hit.daysRemaining <= 14)) {
      core.error(message, annotation);
    } else {
      core.warning(message, annotation);
    }
  }
}

export function writeJobSummary(hits: DeadlineHit[], apiBase: string): void {
  core.summary.addRaw(formatMarkdownReport(hits, apiBase)).write();
}

/**
 * Create or update a single PR comment marked with {@link MARKER}. Deletes nothing when there are
 * zero hits — updates the existing comment to the clean report instead, so a green PR is explicit.
 */
export async function upsertPullRequestComment(
  token: string,
  hits: DeadlineHit[],
  apiBase: string,
): Promise<void> {
  const ctx = github.context;
  if (ctx.eventName !== "pull_request" && ctx.eventName !== "pull_request_target") {
    core.info("Skipping PR comment (not a pull_request event).");
    return;
  }
  const prNumber = ctx.payload.pull_request?.number;
  if (!prNumber) {
    core.warning("pull_request payload is missing a number; skipping comment.");
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = ctx.repo;
  const body = formatMarkdownReport(hits, apiBase);

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });
  const existing = comments.find(
    (comment) => comment.user?.type === "Bot" && comment.body?.includes(MARKER),
  );

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info(`Updated PR comment #${existing.id}.`);
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  core.info("Created PR comment.");
}

/**
 * Open / update / close the single tracking issue. When the checklist is empty the issue is closed;
 * when new hits appear it is reopened and rewritten.
 */
export async function upsertTrackingIssue(
  token: string,
  hits: DeadlineHit[],
  apiBase: string,
  labels: string[],
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const body = formatIssueBody(hits, apiBase);

  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: "all",
    labels: labels[0],
    per_page: 50,
  });
  const existing = issues.find(
    (issue) =>
      !issue.pull_request &&
      (issue.title === ISSUE_TITLE || issue.body?.includes(MARKER)),
  );

  if (!existing) {
    if (hits.length === 0) {
      core.info("No deadline hits and no existing tracking issue; nothing to open.");
      return;
    }
    await octokit.rest.issues.create({
      owner,
      repo,
      title: ISSUE_TITLE,
      body,
      labels,
    });
    core.info("Opened tracking issue.");
    return;
  }

  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: existing.number,
    title: ISSUE_TITLE,
    body,
    state: hits.length === 0 ? "closed" : "open",
    labels,
  });
  core.info(
    hits.length === 0
      ? `Closed tracking issue #${existing.number}.`
      : `Updated tracking issue #${existing.number}.`,
  );
}
