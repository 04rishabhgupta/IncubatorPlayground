import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detailLevel,
  doorGeometry,
  fixturePlacement,
  wallAt,
  wallThickness,
  windowGeometry,
} from "@/lib/floor/drawing";
import { placeLabel } from "@/lib/floor/labels";
import { floorGeometrySchema, fixtureSchema, wallSchema } from "@/lib/floor/geometry";
import { demoGeometry } from "@/lib/floor/samples/demo-floor";

/** The original (v1) Floor 1 geometry JSON, as seeded before Phase 4R.2. */
function v1Geometry() {
  const seed = readFileSync(path.resolve(import.meta.dirname, "../db/fixtures/seed-floor-1-v1.sql"), "utf8");
  const json = /\$json\$([\s\S]*?)\$json\$/.exec(seed)?.[1];
  if (!json) throw new Error("seed geometry not found");
  return JSON.parse(json);
}

describe("geometry v2 schema", () => {
  it("accepts the original Floor 1 layout unchanged and fills the new fields with defaults", () => {
    const parsed = floorGeometrySchema.parse(v1Geometry());
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
    ).toBe(16);
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
    ).toBe(8);
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

  it("hinges a single door's leaf on the wall face on the swing side", () => {
    const down = doorGeometry(
      {
        x: 100,
        y: 200,
        width: 50,
        orientation: "horizontal",
        swing: 1,
        hinge: "start",
        kind: "single",
      },
      8,
    );
    // The cut is as deep as the wall; the face on the +y side is at 204.
    expect(down.gap).toEqual({ x: 100, y: 196, width: 50, height: 8 });
    expect(down.jambs).toEqual([
      { x1: 100, y1: 196, x2: 100, y2: 204 },
      { x1: 150, y1: 196, x2: 150, y2: 204 },
    ]);
    expect(down.leaves).toHaveLength(1);
    expect(down.leaves[0].hinge).toEqual([100, 204]);
    expect(down.leaves[0].tip).toEqual([100, 254]);
    expect(down.leaves[0].arc).toBe("M 150 204 A 50 50 0 0 1 100 254");

    const up = doorGeometry(
      {
        x: 100,
        y: 200,
        width: 50,
        orientation: "horizontal",
        swing: -1,
        hinge: "end",
        kind: "single",
      },
      8,
    );
    expect(up.leaves[0].hinge).toEqual([150, 196]);
    expect(up.leaves[0].tip).toEqual([150, 146]);
    expect(up.leaves[0].arc).toBe("M 100 196 A 50 50 0 0 1 150 146");
  });

  it("splits double doors into two half leaves, and gives sliding doors panels instead of arcs", () => {
    const double = doorGeometry(
      {
        x: 0,
        y: 100,
        width: 80,
        orientation: "vertical",
        swing: 1,
        hinge: "start",
        kind: "double",
      },
      8,
    );
    expect(double.leaves.map((l) => l.hinge)).toEqual([
      [4, 100],
      [4, 180],
    ]);
    expect(double.leaves.map((l) => l.tip)).toEqual([
      [44, 100],
      [44, 180],
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
    expect(sliding.panels).toHaveLength(2);
  });

  it("frames a window on both wall faces with a double glazing line in the middle", () => {
    const w = windowGeometry({ x: 20, y: 100, length: 200, orientation: "vertical" }, 10);
    expect(w.gap).toEqual({ x: 15, y: 100, width: 10, height: 200 });
    expect(w.frame.map((l) => [l.x1, l.x2])).toEqual([
      [15, 15],
      [25, 25],
    ]);
    expect(w.glass.map((l) => [l.x1, l.x2])).toEqual([
      [18.5, 18.5],
      [21.5, 21.5],
    ]);
  });

  it("finds the wall an opening sits on, including a closed wall's last side", () => {
    const outer = wallSchema.parse({
      points: [
        [20, 20],
        [1180, 20],
        [1180, 780],
        [20, 780],
      ],
      closed: true,
      thickness: 24,
    });
    const partition = wallSchema.parse({
      points: [
        [400, 20],
        [400, 320],
      ],
      kind: "interior",
    });
    const walls = [outer, partition];
    expect(wallAt(walls, { x: 20, y: 300, length: 100, orientation: "vertical" })).toBe(outer);
    expect(wallAt(walls, { x: 400, y: 100, length: 40, orientation: "vertical" })).toBe(partition);
    expect(wallAt(walls, { x: 500, y: 400, length: 40, orientation: "horizontal" })).toBeUndefined();
  });

  it("picks the detail level from screen pixels per floor unit", () => {
    expect(detailLevel(0.3)).toBe(0);
    expect(detailLevel(0.94)).toBe(1);
    expect(detailLevel(2.5)).toBe(2);
  });
});

describe("label placement", () => {
  const room = { x: 0, y: 0, width: 360, height: 280 };
  const size = { width: 100, height: 40 };

  it("centres the label when the middle of the room is clear", () => {
    expect(placeLabel(room, size, [])).toEqual({ x: 130, y: 120 });
  });

  it("moves the label off furniture into a clear aisle", () => {
    const desks = { x: 100, y: 100, width: 160, height: 80 };
    const spot = placeLabel(room, size, [desks]);
    expect(spot).toEqual({ x: 130, y: 181.6 });
  });

  it("stays inside the room even when everything is covered", () => {
    const spot = placeLabel(room, size, [room], 6);
    expect(spot.x).toBeGreaterThanOrEqual(6);
    expect(spot.y + size.height).toBeLessThanOrEqual(274);
  });
});
