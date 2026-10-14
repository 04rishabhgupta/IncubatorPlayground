import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { doorGeometry, fixturePlacement, wallThickness, windowGeometry } from "@/lib/floor/drawing";
import { floorGeometrySchema, fixtureSchema, wallSchema } from "@/lib/floor/geometry";
import { demoGeometry } from "@/lib/floor/samples/demo-floor";

/** The Floor 1 geometry JSON from supabase/seed.sql (what the database holds today). */
function seedGeometry() {
  const seed = readFileSync(path.resolve(import.meta.dirname, "../../supabase/seed.sql"), "utf8");
  const json = /\$json\$([\s\S]*?)\$json\$/.exec(seed)?.[1];
  if (!json) throw new Error("seed geometry not found");
  return JSON.parse(json);
}

describe("geometry v2 schema", () => {
  it("accepts today's Floor 1 layout unchanged and fills the new fields with defaults", () => {
    const parsed = floorGeometrySchema.parse(seedGeometry());
    expect(parsed.walls).toHaveLength(1);
    expect(parsed.walls[0].kind).toBe("exterior");
    expect(parsed.doors).toEqual([]);
    expect(parsed.windows).toEqual([]);
    expect(parsed.fixtures).toEqual([]);
    expect(parsed.areas.map((a) => a.kind)).toEqual(["corridor", "lounge", "pantry"]);
  });

  it("accepts the full sample layout", () => {
    const parsed = floorGeometrySchema.parse(demoGeometry);
    expect(parsed.fixtures.length).toBeGreaterThan(40);
    expect(parsed.doors.map((d) => d.kind)).toEqual(expect.arrayContaining(["single", "double", "sliding"]));
    expect(parsed.areas.find((a) => a.key === "lounge")?.info?.amenities).toContain("Sofa");
  });

  it("defaults fixture rotation and door swing", () => {
    expect(fixtureSchema.parse({ kind: "desk", x: 0, y: 0, width: 80, height: 40 }).rotation).toBe(0);
    const geometry = floorGeometrySchema.parse({
      doors: [{ x: 0, y: 0, width: 40, orientation: "horizontal" }],
    });
    expect(geometry.doors[0]).toMatchObject({ swing: 1, hinge: "start", kind: "single" });
  });

  it.each([
    ["an unknown fixture", { fixtures: [{ kind: "spaceship", x: 0, y: 0, width: 10, height: 10 }] }],
    ["a 45° rotation", { fixtures: [{ kind: "desk", x: 0, y: 0, width: 10, height: 10, rotation: 45 }] }],
    ["a tiny door", { doors: [{ x: 0, y: 0, width: 4, orientation: "horizontal" }] }],
    ["a swing that isn't ±1", { doors: [{ x: 0, y: 0, width: 40, orientation: "horizontal", swing: 2 }] }],
    ["negative coordinates", { windows: [{ x: -5, y: 0, length: 40, orientation: "vertical" }] }],
    [
      "too many amenities",
      {
        areas: [
          {
            key: "a",
            kind: "lounge",
            shape: { type: "rect", x: 0, y: 0, width: 10, height: 10 },
            info: { amenities: Array(13).fill("x") },
          },
        ],
      },
    ],
  ])("rejects %s", (_label, input) => {
    expect(floorGeometrySchema.safeParse(input).success).toBe(false);
  });
});

describe("drawing helpers", () => {
  it("uses thickness by wall kind unless overridden", () => {
    expect(
      wallThickness(
        wallSchema.parse({
          points: [
            [0, 0],
            [1, 1],
          ],
        }),
      ),
    ).toBe(8);
    expect(
      wallThickness(
        wallSchema.parse({
          points: [
            [0, 0],
            [1, 1],
          ],
          kind: "interior",
        }),
      ),
    ).toBe(4);
    expect(
      wallThickness(
        wallSchema.parse({
          points: [
            [0, 0],
            [1, 1],
          ],
          kind: "glass",
          thickness: 6,
        }),
      ),
    ).toBe(6);
  });

  it("rotates fixtures around their centre and swaps dimensions for quarter turns", () => {
    const plain = fixturePlacement({ kind: "desk", x: 10, y: 20, width: 80, height: 40, rotation: 0 });
    expect(plain).toEqual({ x: 10, y: 20, width: 80, height: 40, transform: undefined });
    const turned = fixturePlacement({ kind: "desk", x: 10, y: 20, width: 40, height: 80, rotation: 90 });
    // Drawn as an 80×40 desk centred on (30, 60), then rotated into the 40×80 box.
    expect(turned).toEqual({ x: -10, y: 40, width: 80, height: 40, transform: "rotate(90 30 60)" });
  });

  it("draws a single door's leaf and arc on the swing side", () => {
    const down = doorGeometry({
      x: 100,
      y: 200,
      width: 50,
      orientation: "horizontal",
      swing: 1,
      hinge: "start",
      kind: "single",
    });
    expect(down.gap).toEqual({ x: 100, y: 194, width: 50, height: 12 });
    expect(down.leaves).toHaveLength(1);
    expect(down.leaves[0].hinge).toEqual([100, 200]);
    expect(down.leaves[0].tip).toEqual([100, 250]);
    expect(down.leaves[0].arc).toBe("M 150 200 A 50 50 0 0 1 100 250");

    const up = doorGeometry({
      x: 100,
      y: 200,
      width: 50,
      orientation: "horizontal",
      swing: -1,
      hinge: "end",
      kind: "single",
    });
    expect(up.leaves[0].hinge).toEqual([150, 200]);
    expect(up.leaves[0].tip).toEqual([150, 150]);
    expect(up.leaves[0].arc).toBe("M 100 200 A 50 50 0 0 1 150 150");
  });

  it("splits double doors into two half leaves, and gives sliding doors no arc", () => {
    const double = doorGeometry({
      x: 0,
      y: 100,
      width: 80,
      orientation: "vertical",
      swing: 1,
      hinge: "start",
      kind: "double",
    });
    expect(double.leaves.map((l) => l.hinge)).toEqual([
      [0, 100],
      [0, 180],
    ]);
    expect(double.leaves.map((l) => l.tip)).toEqual([
      [40, 100],
      [40, 180],
    ]);
    const sliding = doorGeometry({
      x: 0,
      y: 0,
      width: 60,
      orientation: "horizontal",
      swing: 1,
      hinge: "start",
      kind: "sliding",
    });
    expect(sliding.leaves).toEqual([]);
    expect(sliding.sliding).toBe(true);
  });

  it("puts two glazing lines inside a window opening", () => {
    const w = windowGeometry({ x: 20, y: 100, length: 200, orientation: "vertical" });
    expect(w.gap).toEqual({ x: 15, y: 100, width: 10, height: 200 });
    expect(w.lines.map((l) => [l.x1, l.x2])).toEqual([
      [17.5, 17.5],
      [22.5, 22.5],
    ]);
  });
});
