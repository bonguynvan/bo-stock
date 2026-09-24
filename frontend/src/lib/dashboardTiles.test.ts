import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_KEYS,
  hiddenTiles,
  moveTile,
  normalizeTiles,
} from "@/lib/dashboardTiles";

describe("normalizeTiles", () => {
  it("keeps only known keys, order preserved", () => {
    expect(normalizeTiles(["macro", "world", "bogus", "crypto"])).toEqual([
      "macro",
      "world",
      "crypto",
    ]);
  });

  it("de-duplicates", () => {
    expect(normalizeTiles(["world", "world", "crypto"])).toEqual(["world", "crypto"]);
  });

  it("preserves a valid empty list", () => {
    expect(normalizeTiles([])).toEqual([]);
  });
});

describe("moveTile", () => {
  it("moves a key toward the start", () => {
    expect(moveTile(["a", "world", "crypto"], "world", -1)).toEqual(["world", "a", "crypto"]);
  });

  it("moves a key toward the end", () => {
    expect(moveTile(["world", "crypto", "macro"], "crypto", 1)).toEqual([
      "world",
      "macro",
      "crypto",
    ]);
  });

  it("is a no-op at the boundaries", () => {
    expect(moveTile(["world", "crypto"], "world", -1)).toEqual(["world", "crypto"]);
    expect(moveTile(["world", "crypto"], "crypto", 1)).toEqual(["world", "crypto"]);
  });

  it("does not mutate the input", () => {
    const input = ["world", "crypto"];
    moveTile(input, "world", 1);
    expect(input).toEqual(["world", "crypto"]);
  });
});

describe("hiddenTiles", () => {
  it("returns tiles not currently visible", () => {
    const hidden = hiddenTiles(["world", "crypto"]).map((t) => t.key);
    expect(hidden).not.toContain("world");
    expect(hidden).toContain("macro");
    expect(hidden).toContain("movers");
  });

  it("returns nothing when all tiles are visible", () => {
    expect(hiddenTiles([...DEFAULT_TILE_KEYS])).toEqual([]);
  });
});
