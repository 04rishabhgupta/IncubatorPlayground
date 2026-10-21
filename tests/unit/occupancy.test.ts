import { describe, expect, it } from "vitest";
import { summarizeOccupancy } from "@/lib/floor/occupancy";

const floors = [
  { id: "f1", slug: "floor-1", name: "Floor 1", is_active: true },
  { id: "f2", slug: "floor-2", name: "Floor 2", is_active: false },
];
const offices = [
  { id: "o1", floor_id: "f1", code: "101", label: "Office 101", capacity: 12 },
  { id: "o2", floor_id: "f1", code: "102", label: "Office 102", capacity: 12 },
  { id: "o3", floor_id: "f1", code: "103", label: "Office 103", capacity: null },
];
const company = (id: string, space_id: string | null, team_size: number | null, listed: number) => ({
  id,
  name: id,
  slug: id,
  space_id,
  status: "approved",
  team_size,
  listed,
  availability: null,
});

describe("occupancy overview", () => {
  it("counts occupied offices, desks and people per floor", () => {
    const [f1, f2] = summarizeOccupancy(
      floors,
      offices,
      [company("a", "o1", 15, 3), company("b", "o2", null, 4), company("c", null, 5, 5)],
      [{ space_id: "o3" }, { space_id: "o3" }, { space_id: null }],
    );
    expect(f1).toMatchObject({ occupied: 2, vacant: 1, desks: 24, people: 19 });
    expect(f1.rate).toBeCloseTo(2 / 3);
    // Stated team size wins over the listed members; vacant offices count no one.
    expect(f1.offices.map((o) => [o.code, o.company?.id ?? null, o.people, o.requests])).toEqual([
      ["101", "a", 15, 0],
      ["102", "b", 4, 0],
      ["103", null, 0, 2],
    ]);
    // A floor without offices has no rate rather than 0%.
    expect(f2).toMatchObject({ offices: [], occupied: 0, rate: null, desks: 0 });
  });
});
