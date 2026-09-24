import { describe, expect, it } from "vitest";
import { addRecent } from "@/lib/recentSymbols";

describe("addRecent", () => {
  it("prepends a new symbol", () => {
    expect(addRecent(["VCB"], "FPT")).toEqual(["FPT", "VCB"]);
  });

  it("uppercases and trims", () => {
    expect(addRecent([], " fpt ")).toEqual(["FPT"]);
  });

  it("moves an existing symbol to the front without duplicating", () => {
    expect(addRecent(["VCB", "FPT", "MWG"], "FPT")).toEqual(["FPT", "VCB", "MWG"]);
  });

  it("caps the list at 8", () => {
    const eight = ["A", "B", "C", "D", "E", "F", "G", "H"];
    expect(addRecent(eight, "NEW")).toEqual(["NEW", "A", "B", "C", "D", "E", "F", "G"]);
  });

  it("ignores blank input", () => {
    expect(addRecent(["FPT"], "   ")).toEqual(["FPT"]);
  });

  it("does not mutate the input array", () => {
    const input = ["VCB"];
    addRecent(input, "FPT");
    expect(input).toEqual(["VCB"]);
  });
});
