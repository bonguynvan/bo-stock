import { afterEach, describe, expect, it } from "vitest";
import {
  SCREENS,
  deletePreset,
  loadPanels,
  loadPresets,
  makePanel,
  savePanels,
  screenMeta,
  upsertPreset,
  type Panel,
} from "./workspace";

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* jsdom always has it */
  }
});

describe("workspace panels", () => {
  it("screenMeta returns metadata and falls back to the first screen", () => {
    expect(screenMeta("radar").label).toBe("Radar tín hiệu");
    // @ts-expect-error — unknown id falls back
    expect(screenMeta("nope").id).toBe(SCREENS[0].id);
  });

  it("makePanel seeds geometry from the screen defaults, cascades, and links detail", () => {
    const meta = screenMeta("detail");
    const p0 = makePanel("detail", 0, "HPG");
    expect(p0.screen).toBe("detail");
    expect(p0.symbol).toBe("HPG");
    expect(p0.linked).toBe(true); // detail panels follow the room by default
    expect(p0.w).toBe(meta.defaultW);
    expect(p0.h).toBe(meta.defaultH);

    const p1 = makePanel("radar", 1);
    expect(p1.linked).toBeUndefined(); // non-detail screens aren't symbol-linked
    expect(p1.x).toBeGreaterThan(p0.x); // cascaded so a new panel doesn't hide the last
  });

  it("persists and reloads a layout; tolerates missing/garbage storage", () => {
    expect(loadPanels()).toEqual([]);
    const panels: Panel[] = [makePanel("radar", 0), makePanel("detail", 1, "FPT")];
    savePanels(panels);
    const back = loadPanels();
    expect(back).toHaveLength(2);
    expect(back[1].symbol).toBe("FPT");

    localStorage.setItem("bo.workspace.panels", "{not json");
    expect(loadPanels()).toEqual([]);
  });

  it("upserts, lists, overwrites, and deletes named presets (deep-cloned)", () => {
    expect(loadPresets()).toEqual([]);
    const panels: Panel[] = [makePanel("radar", 0)];
    upsertPreset("Sáng", panels);
    upsertPreset("Chiều", [makePanel("pulse", 0)]);
    expect(loadPresets().map((p) => p.name)).toEqual(["Sáng", "Chiều"]);

    // Same name overwrites (not duplicates) and stores a deep clone.
    const after = upsertPreset("Sáng", [makePanel("sectors", 0), makePanel("detail", 1, "HPG")]);
    expect(after.filter((p) => p.name === "Sáng")).toHaveLength(1);
    const saved = loadPresets().find((p) => p.name === "Sáng")!;
    expect(saved.panels).toHaveLength(2);
    panels[0].x = 999; // mutating the source must not touch the stored preset
    expect(loadPresets().find((p) => p.name === "Sáng")!.panels[0].x).not.toBe(999);

    const left = deletePreset("Sáng");
    expect(left.map((p) => p.name)).toEqual(["Chiều"]);
  });
});
