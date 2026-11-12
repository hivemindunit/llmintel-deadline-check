import { describe, expect, it } from "vitest";
import {
  formatIssueBody,
  formatMarkdownReport,
  modelPageUrl,
  toDeadlineHits,
} from "./report";
import type { CatalogModel, ScanHit } from "./types";

const retiring: CatalogModel = {
  id: "openai/gpt-4o",
  provider: "openai",
  displayName: "GPT-4o",
  aliases: ["gpt-4o"],
  lifecycleState: "deprecated",
  announcedDate: null,
  deprecatedDate: "2026-01-01",
  retirementDate: "2026-12-09",
  replacementId: "openai/gpt-5",
};

describe("modelPageUrl", () => {
  it("links to the model page with the github-action UTM", () => {
    const url = modelPageUrl("https://llmintel.ai", "openai/gpt-4o");
    expect(url).toContain("https://llmintel.ai/models/openai/gpt-4o?");
    expect(url).toContain("utm_source=github-action");
  });
});

describe("toDeadlineHits", () => {
  it("marks hits inside fail_within_days as failing", () => {
    const scan: ScanHit = {
      matchedText: "gpt-4o",
      model: retiring,
      file: "src/a.ts",
      line: 3,
      column: 1,
    };
    const now = new Date("2026-11-12T00:00:00Z");
    const [hit] = toDeadlineHits([scan], 30, now);
    expect(hit!.daysRemaining).toBe(27);
    expect(hit!.shouldFail).toBe(true);
  });
});

describe("formatMarkdownReport", () => {
  it("includes replacement links and the marker comment", () => {
    const hits = toDeadlineHits(
      [
        {
          matchedText: "gpt-4o",
          model: retiring,
          file: "src/a.ts",
          line: 3,
          column: 1,
        },
      ],
      null,
      new Date("2026-11-12T00:00:00Z"),
    );
    const md = formatMarkdownReport(hits, "https://llmintel.ai");
    expect(md).toContain("openai/gpt-4o");
    expect(md).toContain("openai/gpt-5");
    expect(md).toContain("utm_source=github-action");
    expect(md).toContain("<!-- llmintel-deadline-check -->");
  });
});

describe("formatIssueBody", () => {
  it("emits a checklist per hit", () => {
    const hits = toDeadlineHits(
      [
        {
          matchedText: "gpt-4o",
          model: retiring,
          file: "src/a.ts",
          line: 3,
          column: 1,
        },
      ],
      null,
      new Date("2026-11-12T00:00:00Z"),
    );
    const body = formatIssueBody(hits, "https://llmintel.ai");
    expect(body).toContain("- [ ] `gpt-4o` in `src/a.ts:3`");
    expect(body).toContain("migrate to `openai/gpt-5`");
  });
});
