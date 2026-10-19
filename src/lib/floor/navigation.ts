import type { Bounds } from "./geometry";

export type Direction = "left" | "right" | "up" | "down";

export const arrowDirections: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/**
 * Keyboard room navigation: the nearest target in a direction, by centre
 * point. Candidates must lie within a 2:1 cone around the arrow (so "right"
 * from the top-right office doesn't jump down to reception), and sideways
 * offset counts double so the room straight ahead wins over a closer diagonal
 * one. Returns null when there is nothing that way.
 */
export function nearestInDirection<T extends { id: string; bounds: Bounds }>(
  fromId: string,
  targets: T[],
  direction: Direction,
): T | null {
  const from = targets.find((t) => t.id === fromId);
  if (!from) return null;
  const centre = (b: Bounds) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const origin = centre(from.bounds);
  let best: { target: T; score: number } | null = null;
  for (const target of targets) {
    if (target.id === fromId) continue;
    const c = centre(target.bounds);
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const ahead = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    const side = Math.abs(direction === "left" || direction === "right" ? dy : dx);
    if (ahead <= 0 || side > ahead * 2) continue;
    const score = ahead + side * 2;
    if (!best || score < best.score) best = { target, score };
  }
  return best?.target ?? null;
}
