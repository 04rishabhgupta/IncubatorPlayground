import { describe, expect, it } from "vitest";
import { shapeBounds } from "@/lib/floor/geometry";
import { FLOOR_1_SPACES, floor1Geometry } from "@/lib/floor/layouts/floor-1";
import { nearestInDirection } from "@/lib/floor/navigation";
import { matchArea, matchCompany, matchSpace, normalize } from "@/lib/floor/search";
import { demoFloorPlan } from "@/lib/floor/samples/demo-floor";

const robotics = demoFloorPlan.companies.find((c) => c.name === "Sample Robotics")!;
const office101 = demoFloorPlan.spaces.find((s) => s.code === "101")!;
const lounge = floor1Geometry.areas.find((a) => a.key === "lounge")!;
const pantry = floor1Geometry.areas.find((a) => a.key === "pantry")!;

describe("floor search", () => {
  it("ignores case and accents", () => {
    expect(normalize("  Café ÉCLAIR ")).toBe("cafe eclair");
  });

  it("matches a company by name without a reason, and by team member with one", () => {
    expect(matchCompany(robotics, office101, "robot")).toEqual({ reason: null });
    expect(matchCompany(robotics, office101, "asha")).toEqual({ reason: "Team: Asha Rao" });
  });

  it("matches industry and office number, and needs every word to match", () => {
    expect(matchCompany(robotics, office101, "deep tech")).not.toBeNull();
    expect(matchCompany(robotics, office101, "101")).not.toBeNull();
    expect(matchCompany(robotics, office101, "asha 101")).toEqual({ reason: "Team: Asha Rao" });
    expect(matchCompany(robotics, office101, "asha fintech")).toBeNull();
  });

  it("matches everything for an empty query", () => {
    expect(matchCompany(robotics, office101, "   ")).toEqual({ reason: null });
  });

  it("finds shared areas by name, kind or amenity", () => {
    expect(matchArea(lounge, "lounge")).toEqual({ reason: null });
    expect(matchArea(pantry, "coffee")).toEqual({ reason: "Amenity: Coffee machine" });
    expect(matchArea(lounge, "coffee")).toBeNull();
  });

  it("finds shared rooms by label or code", () => {
    const boardroom = demoFloorPlan.spaces.find((s) => s.code === "BR-1")!;
    expect(matchSpace(boardroom, "board")).not.toBeNull();
    expect(matchSpace(boardroom, "br-1")).not.toBeNull();
    expect(matchSpace(boardroom, "pantry")).toBeNull();
  });
});

describe("keyboard room navigation on Floor 1", () => {
  const targets = [
    ...Object.entries(FLOOR_1_SPACES).map(([code, shape]) => ({ id: code, bounds: shapeBounds(shape) })),
    ...floor1Geometry.areas
      .filter((a) => a.kind !== "corridor")
      .map((a) => ({ id: a.key, bounds: shapeBounds(a.shape) })),
  ];
  const go = (from: string, direction: "left" | "right" | "up" | "down") =>
    nearestInDirection(from, targets, direction)?.id ?? null;

  it.each([
    ["101", "right", "102"],
    ["102", "right", "103"],
    ["103", "left", "102"],
    ["101", "down", "104"],
    ["102", "down", "BR-1"],
    ["103", "down", "REC"],
    ["104", "right", "BR-1"],
    ["BR-1", "right", "lounge"],
    ["lounge", "down", "pantry"],
    ["lounge", "right", "REC"],
    ["pantry", "up", "lounge"],
    ["REC", "up", "103"],
  ] as const)("%s → %s goes to %s", (from, direction, to) => {
    expect(go(from, direction)).toBe(to);
  });

  it("stays put at the edge of the floor", () => {
    expect(go("101", "left")).toBeNull();
    expect(go("101", "up")).toBeNull();
    expect(go("103", "right")).toBeNull();
  });
});
