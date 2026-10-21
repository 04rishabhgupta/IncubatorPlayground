import { z } from "zod";
import { wallAt } from "./drawing";
import {
  floorGeometrySchema,
  shapeBounds,
  shapeSchema,
  type Bounds,
  type FloorGeometry,
  type Shape,
} from "./geometry";

/**
 * The layout editor's document (Phase 4R.6): a whole floor as one JSON value.
 *
 *   { "width": 1200, "height": 800, "geometry": { walls, areas, … }, "spaces": { "101": { shape }, … } }
 *
 * `validateLayoutDocument` runs in the browser (live preview) and again on the
 * server before saving. Errors block saving; warnings point at things that are
 * probably mistakes but still render.
 */

export const layoutDocumentSchema = z.object({
  width: z.number().int().min(100).max(10_000),
  height: z.number().int().min(100).max(10_000),
  geometry: floorGeometrySchema,
  spaces: z.record(z.string(), shapeSchema),
});

export type LayoutDocument = {
  width: number;
  height: number;
  geometry: FloorGeometry;
  spaces: Record<string, Shape>;
};

export type Problem = { path: string; message: string };

export type ValidationResult = {
  document: LayoutDocument | null;
  errors: Problem[];
  warnings: Problem[];
};

/** Pretty-printed document text, as the editor shows it. */
export function formatDocument(doc: unknown) {
  return JSON.stringify(doc, null, 2);
}

/** "geometry.fixtures[12].width" from a zod issue path. */
function pathText(path: PropertyKey[]) {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : `${i ? "." : ""}${String(p)}`)).join("");
}

/** 1-based line and column of a character offset, for JSON syntax errors. */
function lineCol(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

/**
 * Offset of the first JSON syntax error in `text` (null if it's valid), found
 * with a small recursive-descent scan that follows the JSON grammar.
 */
export function jsonErrorOffset(text: string): number | null {
  let i = 0;
  class Stop extends Error {}
  const fail = (): never => {
    throw new Stop();
  };
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const literal = (word: string) => {
    for (const ch of word) {
      if (text[i] !== ch) fail();
      i++;
    }
  };
  const string = () => {
    if (text[i] !== '"') fail();
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] < " ") fail();
      if (text[i] === "\\") {
        i++;
        if (text[i] === "u") {
          for (let k = 0; k < 4; k++) {
            i++;
            if (!/[0-9a-fA-F]/.test(text[i] ?? "")) fail();
          }
        } else if (!'"\\/bfnrt'.includes(text[i] ?? "x")) fail();
      }
      i++;
    }
    if (text[i] !== '"') fail();
    i++;
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m || !m[0] || m[0] === "-") fail();
    i += m![0].length;
  };
  const value = (): void => {
    ws();
    const ch = text[i];
    if (ch === "{") {
      i++;
      ws();
      if (text[i] === "}") return void i++;
      for (;;) {
        ws();
        string();
        ws();
        if (text[i] !== ":") fail();
        i++;
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "}") return void i++;
        else fail();
      }
    }
    if (ch === "[") {
      i++;
      ws();
      if (text[i] === "]") return void i++;
      for (;;) {
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "]") return void i++;
        else fail();
      }
    }
    if (ch === '"') return string();
    if (ch === "t") return literal("true");
    if (ch === "f") return literal("false");
    if (ch === "n") return literal("null");
    number();
  };
  try {
    value();
    ws();
    return i < text.length ? i : null;
  } catch (error) {
    if (error instanceof Stop) return i;
    throw error;
  }
}

function overlaps(a: Bounds, b: Bounds) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const inside = (b: Bounds, w: number, h: number) =>
  b.x >= 0 && b.y >= 0 && b.x + b.width <= w && b.y + b.height <= h;

/**
 * Parse and check an editor document. `spaceCodes` are the floor's existing
 * space codes: the document must contain exactly these (spaces are reshaped,
 * never added or removed, so their ids and placements stay).
 */
export function validateLayoutDocument(text: string, spaceCodes: string[]): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    // Browsers' messages differ (and newer ones give no position), so find it ourselves.
    const offset = jsonErrorOffset(text);
    const where = offset === null ? null : lineCol(text, offset);
    const found =
      offset === null || offset >= text.length ? "the end of the text" : JSON.stringify(text[offset]);
    return {
      document: null,
      errors: [
        {
          path: where ? `line ${where.line}, column ${where.column}` : "JSON",
          message:
            error instanceof Error && !where ? error.message : `This isn't valid JSON: unexpected ${found}.`,
        },
      ],
      warnings: [],
    };
  }

  const parsed = layoutDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      document: null,
      errors: parsed.error.issues
        .slice(0, 20)
        .map((i) => ({ path: pathText(i.path) || "document", message: i.message })),
      warnings: [],
    };
  }
  const doc = parsed.data as LayoutDocument;
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  // Spaces: exactly the existing codes.
  const codes = Object.keys(doc.spaces);
  for (const code of spaceCodes) {
    if (!codes.includes(code))
      errors.push({
        path: `spaces`,
        message: `Space "${code}" is missing. Spaces can be reshaped but not removed here.`,
      });
  }
  for (const code of codes) {
    if (!spaceCodes.includes(code)) {
      errors.push({
        path: `spaces.${code}`,
        message: `There is no space "${code}" on this floor. New spaces can't be added here.`,
      });
    }
  }

  // Everything should lie on the canvas.
  const { width: w, height: h, geometry: g } = doc;
  for (const [code, shape] of Object.entries(doc.spaces)) {
    if (!inside(shapeBounds(shape), w, h))
      warnings.push({ path: `spaces.${code}`, message: "Lies partly outside the floor." });
  }
  g.fixtures.forEach((f, i) => {
    if (!inside(f, w, h))
      warnings.push({ path: `geometry.fixtures[${i}]`, message: `${f.kind} lies partly outside the floor.` });
  });
  g.walls.forEach((wall, i) => {
    if (wall.points.some(([x, y]) => x > w || y > h)) {
      warnings.push({ path: `geometry.walls[${i}]`, message: "Has points outside the floor." });
    }
  });

  // Rooms shouldn't overlap each other.
  const entries = Object.entries(doc.spaces).map(([code, shape]) => [code, shapeBounds(shape)] as const);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (overlaps(entries[i][1], entries[j][1])) {
        warnings.push({ path: `spaces.${entries[i][0]}`, message: `Overlaps space "${entries[j][0]}".` });
      }
    }
  }

  // Openings should sit on a wall, or they are drawn as holes in nothing.
  g.doors.forEach((d, i) => {
    if (!wallAt(g.walls, { x: d.x, y: d.y, length: d.width, orientation: d.orientation })) {
      warnings.push({ path: `geometry.doors[${i}]`, message: "Isn't on any wall." });
    }
  });
  g.windows.forEach((win, i) => {
    if (!wallAt(g.walls, { x: win.x, y: win.y, length: win.length, orientation: win.orientation })) {
      warnings.push({ path: `geometry.windows[${i}]`, message: "Isn't on any wall." });
    }
  });

  // Seat numbers must be unique within an office, or two people share a desk.
  for (const [code, shape] of Object.entries(doc.spaces)) {
    const b = shapeBounds(shape);
    const seen = new Set<number>();
    for (const f of g.fixtures) {
      if (f.seat === undefined) continue;
      const cx = f.x + f.width / 2;
      const cy = f.y + f.height / 2;
      if (cx < b.x || cx > b.x + b.width || cy < b.y || cy > b.y + b.height) continue;
      if (seen.has(f.seat))
        warnings.push({ path: `spaces.${code}`, message: `Seat ${f.seat} is used twice.` });
      seen.add(f.seat);
    }
  }

  return { document: errors.length ? null : doc, errors, warnings };
}
