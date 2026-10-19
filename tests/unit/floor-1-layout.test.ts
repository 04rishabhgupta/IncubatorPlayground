import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { floorGeometrySchema, shapeBounds } from "@/lib/floor/geometry";
import { FLOOR_1_SIZE, FLOOR_1_SPACES, floor1Geometry } from "@/lib/floor/layouts/floor-1";
import { assignSeats, initials, officeSeats } from "@/lib/floor/seats";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Every $json$ … $json$ block in a SQL file. */
const jsonBlocks = (sql: string) =>
  sql
    .split("$json$")
    .filter((_, i) => i % 2 === 1)
    .map((j) => JSON.parse(j));

describe("Floor 1 layout", () => {
  it("is valid geometry that fits the canvas", () => {
    const parsed = floorGeometrySchema.parse(floor1Geometry);
    for (const f of parsed.fixtures) {
      expect(f.x + f.width).toBeLessThanOrEqual(FLOOR_1_SIZE.width);
      expect(f.y + f.height).toBeLessThanOrEqual(FLOOR_1_SIZE.height);
    }
  });

  it("is the drawing in seed.sql and in the migration (no drift)", () => {
    const [seeded] = jsonBlocks(read("supabase/seed.sql"));
    expect(seeded).toEqual(plain(floor1Geometry));

    const migration = read("supabase/migrations/20261017090000_floor1_architectural_plan.sql");
    const [next, original] = jsonBlocks(migration);
    expect(next).toEqual(plain(floor1Geometry));
    // The guard compares against the drawing that was seeded before Phase 4R.2.
    expect(original).toEqual(jsonBlocks(read("tests/db/fixtures/seed-floor-1-v1.sql"))[0]);
    for (const [code, shape] of Object.entries(FLOOR_1_SPACES)) {
      expect(migration).toContain(`('${code}', '${JSON.stringify(shape)}')`);
    }
  });

  it("keeps the room codes and puts every room inside the outer walls", () => {
    expect(Object.keys(FLOOR_1_SPACES).sort()).toEqual(["101", "102", "103", "104", "BR-1", "REC"]);
    for (const shape of Object.values(FLOOR_1_SPACES)) {
      const b = shapeBounds(shape);
      expect(b.x).toBeGreaterThanOrEqual(40);
      expect(b.y).toBeGreaterThanOrEqual(40);
      expect(b.x + b.width).toBeLessThanOrEqual(1160);
      expect(b.y + b.height).toBeLessThanOrEqual(760);
    }
  });

  it("gives each office 12 seats numbered 1–12, window side first", () => {
    for (const code of ["101", "102", "103", "104"]) {
      const seats = officeSeats(FLOOR_1_SPACES[code], floor1Geometry.fixtures);
      expect(seats.map((s) => s.seat)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      // Seats 1–6 are the row nearest the outside wall.
      const north = code !== "104";
      const front = seats.slice(0, 6).map((s) => s.y);
      const back = seats.slice(6).map((s) => s.y);
      expect(north ? Math.max(...front) < Math.min(...back) : Math.min(...front) > Math.max(...back)).toBe(
        true,
      );
    }
  });
});

describe("team seating", () => {
  const seats = officeSeats(FLOOR_1_SPACES["101"], floor1Geometry.fixtures);

  it("fills seats in team order and counts members beyond the last seat", () => {
    const small = assignSeats(seats, ["a", "b"]);
    expect(small.seats.slice(0, 3).map((s) => s.member)).toEqual(["a", "b", null]);
    expect(small.overflow).toBe(0);
    const big = assignSeats(
      seats,
      Array.from({ length: 14 }, (_, i) => i),
    );
    expect(big.seats.every((s) => s.member !== null)).toBe(true);
    expect(big.overflow).toBe(2);
  });

  it("only uses seats inside the office", () => {
    expect(officeSeats(FLOOR_1_SPACES["BR-1"], floor1Geometry.fixtures)).toEqual([]);
  });

  it.each([
    ["Asha Rao", "AR"],
    ["  meera  k  iyer ", "MI"],
    ["Lata", "L"],
    ["", "?"],
  ])("initials of %j are %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
