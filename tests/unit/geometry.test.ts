import { describe, expect, it } from "vitest";
import { floorGeometrySchema, shapeBounds, shapeCenter, shapeSchema } from "@/lib/floor/geometry";

describe("floor geometry", () => {
  it("accepts rect and polygon shapes", () => {
    expect(shapeSchema.parse({ type: "rect", x: 0, y: 0, width: 10, height: 5 })).toBeTruthy();
    expect(
      shapeSchema.parse({
        type: "polygon",
        points: [
          [0, 0],
          [10, 0],
          [5, 8],
        ],
      }),
    ).toBeTruthy();
  });

  it("rejects malformed shapes", () => {
    expect(shapeSchema.safeParse({ type: "rect", x: 0, y: 0, width: -1, height: 5 }).success).toBe(false);
    expect(
      shapeSchema.safeParse({
        type: "polygon",
        points: [
          [0, 0],
          [1, 1],
        ],
      }).success,
    ).toBe(false);
    expect(shapeSchema.safeParse({ type: "circle", r: 4 }).success).toBe(false);
  });

  it("fills defaults for an empty layout", () => {
    expect(floorGeometrySchema.parse({})).toEqual({ walls: [], areas: [], entrances: [] });
  });

  it("computes bounds and centers", () => {
    const poly = {
      type: "polygon" as const,
      points: [
        [10, 20],
        [50, 20],
        [50, 60],
      ] as [number, number][],
    };
    expect(shapeBounds(poly)).toEqual({ x: 10, y: 20, width: 40, height: 40 });
    expect(shapeCenter({ type: "rect", x: 0, y: 0, width: 100, height: 50 })).toEqual({ x: 50, y: 25 });
  });
});
