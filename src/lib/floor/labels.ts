import type { Bounds } from "./geometry";

/**
 * Where to put a room's label plate: the first of a few candidate spots
 * (centre first, then the aisles above/below and the sides) where it doesn't
 * cover any furniture, or else the spot that covers the least. Positions stay
 * inside the room. Pure so it can be unit tested.
 */

const CANDIDATES: Array<[number, number]> = [
  [0.5, 0.5],
  [0.5, 0.72],
  [0.5, 0.28],
  [0.3, 0.5],
  [0.7, 0.5],
  [0.3, 0.72],
  [0.7, 0.72],
  [0.3, 0.28],
  [0.7, 0.28],
];

function overlap(a: Bounds, b: Bounds) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Top-left corner for a `size` plate inside `room`, avoiding `obstacles`. */
export function placeLabel(
  room: Bounds,
  size: { width: number; height: number },
  obstacles: Bounds[],
  margin = 0,
): { x: number; y: number } {
  const nearby = obstacles.filter((o) => overlap(o, room) > 0);
  const clamp = (v: number, lo: number, hi: number) =>
    hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  let best = { x: 0, y: 0, score: Infinity };
  for (const [fx, fy] of CANDIDATES) {
    const x = clamp(
      room.x + room.width * fx - size.width / 2,
      room.x + margin,
      room.x + room.width - margin - size.width,
    );
    const y = clamp(
      room.y + room.height * fy - size.height / 2,
      room.y + margin,
      room.y + room.height - margin - size.height,
    );
    const plate = { x, y, width: size.width, height: size.height };
    const score = nearby.reduce((sum, o) => sum + overlap(plate, o), 0);
    if (score === 0) return { x, y };
    if (score < best.score) best = { x, y, score };
  }
  return { x: best.x, y: best.y };
}
