import { describe, expect, it } from "vitest";
import { FLOOR_1_SIZE, FLOOR_1_SPACES, floor1Geometry } from "@/lib/floor/layouts/floor-1";
import { formatDocument, jsonErrorOffset, validateLayoutDocument } from "@/lib/floor/layout-document";

const codes = Object.keys(FLOOR_1_SPACES);
const floor1 = () =>
  JSON.parse(JSON.stringify({ ...FLOOR_1_SIZE, geometry: floor1Geometry, spaces: FLOOR_1_SPACES }));
const check = (doc: unknown) => validateLayoutDocument(formatDocument(doc), codes);

describe("layout editor document", () => {
  it("accepts today's Floor 1 with no errors or warnings", () => {
    const result = check(floor1());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.document?.geometry.fixtures).toHaveLength(floor1Geometry.fixtures.length);
  });

  it("points at the line and column of a JSON syntax error", () => {
    const result = validateLayoutDocument('{\n  "width": 1200,\n  "height": ,\n}', codes);
    expect(result.document).toBeNull();
    expect(result.errors[0]).toEqual({
      path: "line 3, column 13",
      message: 'This isn\'t valid JSON: unexpected ",".',
    });
  });

  it.each([
    ['{"a": 1}', null],
    ["[1, 2.5e3, -0, true, null]", null],
    ['{"a": "x\\u00e9\\n"}', null],
    ['{"a": 1,}', 8],
    ["[1 2]", 3],
    ['{"a" 1}', 5],
    ["{\"a\": 'x'}", 6],
    ["[01]", 2],
    ['{"a": tru}', 9],
    ['{"a": 1} x', 9],
    ["", 0],
  ])("finds the first JSON error in %j at %s", (text, offset) => {
    expect(jsonErrorOffset(text)).toBe(offset);
    // Agrees with JSON.parse on whether the text is valid.
    expect(offset === null).toBe(
      (() => {
        try {
          JSON.parse(text);
          return true;
        } catch {
          return false;
        }
      })(),
    );
  });

  it("reports schema problems with their path", () => {
    const doc = floor1();
    doc.geometry.fixtures[3].kind = "spaceship";
    doc.width = 50;
    const result = check(doc);
    expect(result.document).toBeNull();
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(["width", "geometry.fixtures[3].kind"]),
    );
  });

  it("requires exactly the floor's space codes", () => {
    const doc = floor1();
    delete doc.spaces["104"];
    doc.spaces["999"] = doc.spaces["101"];
    const result = check(doc);
    expect(result.document).toBeNull();
    expect(result.errors.map((e) => e.message).join(" ")).toMatch(/"104" is missing.*no space "999"/);
  });

  it("warns about overlaps, things off the floor, openings off walls and duplicate seats", () => {
    const doc = floor1();
    doc.spaces["102"] = { ...doc.spaces["101"], x: 200 }; // overlaps 101
    doc.geometry.fixtures[0].x = 1190; // off the right edge
    doc.geometry.doors[0].y = 400; // in the middle of the corridor
    const seats = doc.geometry.fixtures.filter((f: { seat?: number }) => f.seat);
    seats[2].seat = seats[1].seat; // two desks in office 101 share a seat number (fixture 0 moved away)

    const result = check(doc);
    expect(result.errors).toEqual([]);
    expect(result.document).not.toBeNull(); // warnings don't block saving
    const messages = result.warnings.map((w) => `${w.path}: ${w.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'spaces.101: Overlaps space "102".',
        expect.stringMatching(/^geometry\.fixtures\[0\]: .* outside the floor\.$/),
        "geometry.doors[0]: Isn't on any wall.",
        expect.stringMatching(/^spaces\.101: Seat \d+ is used twice\.$/),
      ]),
    );
  });
});
