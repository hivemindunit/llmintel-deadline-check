import * as core from "@actions/core";
import type { ActionConfig } from "./types";

function splitList(value: string): string[] {
  return value
    .split(/[,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBool(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Expected a non-negative integer, got "${value}".`);
  }
  return n;
}

/** Read Action inputs (or env fallbacks for local runs). */
export function readConfig(): ActionConfig {
  const daysAhead = parseOptionalInt(core.getInput("days_ahead") || "120") ?? 120;
  const failWithinDays = parseOptionalInt(core.getInput("fail_within_days") || "");
  const providersRaw = splitList(core.getInput("providers") || "");
  const paths = splitList(
    core.getInput("paths") ||
      "**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,yml,yaml,json,toml,md,env*}",
  );
  const exclude = splitList(
    core.getInput("exclude") ||
      "**/node_modules/**,**/.git/**,**/dist/**,**/vendor/**,**/.next/**,**/coverage/**,**/build/**",
  );

  return {
    daysAhead,
    failWithinDays,
    providers: providersRaw.length > 0 ? new Set(providersRaw.map((p) => p.toLowerCase())) : null,
    paths,
    exclude,
    apiBase: (core.getInput("api_base") || "https://llmintel.ai").replace(/\/$/, ""),
    commentOnPr: parseBool(core.getInput("comment_on_pr") || "true", true),
    createIssue: parseBool(core.getInput("create_issue") || "false", false),
    issueLabels: splitList(core.getInput("issue_labels") || "llmintel-deadline-check"),
    githubToken: core.getInput("github_token") || process.env.GITHUB_TOKEN || "",
    workspace: process.env.GITHUB_WORKSPACE || process.cwd(),
  };
}
