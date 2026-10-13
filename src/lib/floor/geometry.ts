import { z } from "zod";

/**
 * Floor geometry lives in the database (floor_layouts.geometry and
 * floor_spaces.shape) so floors can be redrawn without code changes.
 * These schemas are the single source of truth for its shape; anything read
 * from the database is parsed through them before it reaches the SVG renderer.
 */

const coordinate = z.number().finite().min(0).max(10_000);
const point = z.tuple([coordinate, coordinate]);

export const rectShapeSchema = z.object({
  type: z.literal("rect"),
  x: coordinate,
  y: coordinate,
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
  rx: z.number().min(0).max(100).optional(),
});

export const polygonShapeSchema = z.object({
  type: z.literal("polygon"),
  points: z.array(point).min(3).max(200),
});

export const shapeSchema = z.discriminatedUnion("type", [rectShapeSchema, polygonShapeSchema]);

export const wallSchema = z.object({
  points: z.array(point).min(2).max(500),
  closed: z.boolean().default(false),
});

export const areaKindSchema = z.enum(["corridor", "lounge", "pantry", "restroom", "stairs", "lift", "other"]);

export const areaSchema = z.object({
  key: z.string().min(1).max(40),
  kind: areaKindSchema,
  label: z.string().max(80).optional(),
  shape: shapeSchema,
});

export const entranceSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().max(80).optional(),
  x: coordinate,
  y: coordinate,
  width: z.number().positive().max(1_000),
  orientation: z.enum(["horizontal", "vertical"]),
});

export const floorGeometrySchema = z.object({
  walls: z.array(wallSchema).max(200).default([]),
  areas: z.array(areaSchema).max(200).default([]),
  entrances: z.array(entranceSchema).max(50).default([]),
});

export type Shape = z.infer<typeof shapeSchema>;
export type FloorGeometry = z.infer<typeof floorGeometrySchema>;
export type FloorArea = z.infer<typeof areaSchema>;
export type FloorEntrance = z.infer<typeof entranceSchema>;

/** Axis-aligned bounding box of a shape (used for label placement and zoom-to-fit). */
export function shapeBounds(shape: Shape) {
  if (shape.type === "rect") {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  const xs = shape.points.map(([x]) => x);
  const ys = shape.points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Center of a shape's bounding box. */
export function shapeCenter(shape: Shape) {
  const b = shapeBounds(shape);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export type Bounds = { x: number; y: number; width: number; height: number };

/** Value for an SVG <polygon points="…"> attribute. */
export function polygonPoints(points: Array<[number, number]>) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * Shortens a label so it fits a given width at a given font size. SVG text
 * does not wrap or ellipsize, so this uses an average glyph width estimate.
 */
export function fitLabel(text: string, maxWidth: number, fontSize: number) {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.56)));
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 1) return "…";
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Font size for labels inside a space, scaled to its size within sensible limits. */
export function labelFontSize(bounds: Bounds, { min = 12, max = 26, ratio = 0.11 } = {}) {
  return Math.round(Math.min(max, Math.max(min, Math.min(bounds.width, bounds.height) * ratio)));
}
