import { describe, expect, it } from "vitest";
import { buildCatalogIndex } from "./catalog";
import { isBoundedMatch, positionAt, scanContent } from "./scan";
import type { CatalogModel } from "./types";

const catalog: CatalogModel[] = [
  {
    id: "openai/gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    aliases: ["gpt-4o"],
    lifecycleState: "deprecated",
    announcedDate: null,
    deprecatedDate: "2026-01-01",
    retirementDate: "2026-12-01",
  },
  {
    id: "openai/gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o mini",
    aliases: ["gpt-4o-mini"],
    lifecycleState: "active",
    announcedDate: null,
    deprecatedDate: null,
    retirementDate: null,
  },
];

describe("isBoundedMatch", () => {
  it("rejects a match that is a prefix of a longer id token", () => {
    const content = 'model = "gpt-4o-mini"';
    const idx = content.indexOf("gpt-4o");
    expect(isBoundedMatch(content, idx, "gpt-4o".length)).toBe(false);
  });

  it("accepts a match surrounded by quotes", () => {
    const content = 'model = "gpt-4o"';
    const idx = content.indexOf("gpt-4o");
    expect(isBoundedMatch(content, idx, "gpt-4o".length)).toBe(true);
  });
});

describe("scanContent", () => {
  it("prefers the longest matching catalog key", () => {
    const index = buildCatalogIndex(catalog);
    const hits = scanContent('const model = "gpt-4o-mini";', "app.ts", index);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.matchedText).toBe("gpt-4o-mini");
    expect(hits[0]!.model.id).toBe("openai/gpt-4o-mini");
  });

  it("reports file:line for a hit", () => {
    const index = buildCatalogIndex(catalog);
    const content = "line1\nconst m = 'gpt-4o';\n";
    const hits = scanContent(content, "src/client.py", index);
    expect(hits[0]).toMatchObject({ file: "src/client.py", line: 2, matchedText: "gpt-4o" });
  });

  it("does not match untracked lookalikes", () => {
    const index = buildCatalogIndex(catalog);
    expect(scanContent('model = "gpt-5-ultra"', "x.ts", index)).toHaveLength(0);
  });
});

describe("positionAt", () => {
  it("returns 1-based line and column", () => {
    expect(positionAt("ab\ncd", 3)).toEqual({ line: 2, column: 1 });
  });
});
