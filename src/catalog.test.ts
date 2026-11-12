import { describe, expect, it, vi } from "vitest";
import {
  buildCatalogIndex,
  daysUntil,
  fetchCatalog,
  isDeadlineRelevant,
  lookupModels,
} from "./catalog";
import type { CatalogModel } from "./types";

function model(partial: Partial<CatalogModel> & Pick<CatalogModel, "id">): CatalogModel {
  return {
    provider: "openai",
    displayName: partial.id,
    aliases: [],
    lifecycleState: "active",
    announcedDate: null,
    deprecatedDate: null,
    retirementDate: null,
    ...partial,
  };
}

describe("daysUntil", () => {
  it("counts whole UTC days until a date", () => {
    const now = new Date("2026-11-12T15:00:00Z");
    expect(daysUntil("2026-11-12", now)).toBe(0);
    expect(daysUntil("2026-11-13", now)).toBe(1);
    expect(daysUntil("2026-11-11", now)).toBe(-1);
  });
});

describe("isDeadlineRelevant", () => {
  const now = new Date("2026-11-12T00:00:00Z");

  it("always includes retired models", () => {
    expect(
      isDeadlineRelevant(model({ id: "openai/old", lifecycleState: "retired" }), 30, now),
    ).toBe(true);
  });

  it("includes deprecated models inside the days_ahead window", () => {
    expect(
      isDeadlineRelevant(
        model({
          id: "openai/gpt-x",
          lifecycleState: "deprecated",
          retirementDate: "2026-12-01",
        }),
        30,
        now,
      ),
    ).toBe(true);
  });

  it("excludes deprecated models beyond the window", () => {
    expect(
      isDeadlineRelevant(
        model({
          id: "openai/gpt-x",
          lifecycleState: "deprecated",
          retirementDate: "2027-06-01",
        }),
        30,
        now,
      ),
    ).toBe(false);
  });

  it("ignores active models with no retirement date", () => {
    expect(isDeadlineRelevant(model({ id: "openai/gpt-4o" }), 120, now)).toBe(false);
  });
});

describe("buildCatalogIndex", () => {
  it("indexes canonical ids, bare suffixes, and aliases", () => {
    const index = buildCatalogIndex([
      model({
        id: "openai/gpt-4o",
        aliases: ["gpt-4o-latest"],
      }),
    ]);
    expect(index.get("openai/gpt-4o")?.id).toBe("openai/gpt-4o");
    expect(index.get("gpt-4o")?.id).toBe("openai/gpt-4o");
    expect(index.get("gpt-4o-latest")?.id).toBe("openai/gpt-4o");
  });

  it("lets the originating vendor keep a bare name over a reseller alias", () => {
    const index = buildCatalogIndex([
      model({
        id: "azure/gpt-4o-2024-05-13",
        provider: "azure",
        aliases: ["gpt-4o"],
        lifecycleState: "retiring",
        retirementDate: "2026-12-09",
      }),
      model({
        id: "openai/gpt-4o",
        aliases: ["gpt-4o"],
        lifecycleState: "active",
      }),
    ]);
    expect(index.get("gpt-4o")?.id).toBe("openai/gpt-4o");
    expect(index.get("azure/gpt-4o-2024-05-13")?.id).toBe("azure/gpt-4o-2024-05-13");
  });
});

describe("fetchCatalog", () => {
  it("paginates until a short page", async () => {
    const row = (id: string, state = "active") => ({
      id,
      provider: "openai",
      displayName: id,
      aliases: [],
      lifecycleState: state,
      announcedDate: null,
      deprecatedDate: null,
      retirementDate: null,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [row("openai/a"), row("openai/b")], count: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [row("openai/c", "deprecated")],
          count: 1,
        }),
      });

    // Full first page (size 2) forces a second request; the short second page stops the loop.
    const models = await fetchCatalog("https://llmintel.ai", { fetchImpl, pageSize: 2 });
    expect(models.map((m) => m.id)).toEqual(["openai/a", "openai/b", "openai/c"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("lookupModels", () => {
  it("maps refs to models from the bulk lookup endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            ref: "gpt-4o",
            model: {
              id: "openai/gpt-4o",
              provider: "openai",
              displayName: "GPT-4o",
              aliases: ["gpt-4o"],
              lifecycleState: "active",
              announcedDate: null,
              deprecatedDate: null,
              retirementDate: null,
              replacementId: null,
            },
          },
          { ref: "nope", model: null },
        ],
      }),
    });

    const map = await lookupModels("https://llmintel.ai", ["gpt-4o", "nope"], { fetchImpl });
    expect(map.get("gpt-4o")?.id).toBe("openai/gpt-4o");
    expect(map.has("nope")).toBe(false);
  });
});
