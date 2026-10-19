import { shapeBounds, type FloorFixture, type Shape } from "./geometry";

/**
 * Team seating: an office's numbered workstation chairs (fixtures with a
 * `seat`) are filled with its public team members in team order. Members
 * beyond the last seat are counted as overflow; seats beyond the team stay
 * empty. Pure so it can be unit tested; the renderer only draws the result.
 */

export type Seat = { seat: number; x: number; y: number };

/** Numbered seats whose centre lies inside the office, in seat order. */
export function officeSeats(shape: Shape, fixtures: FloorFixture[]): Seat[] {
  const b = shapeBounds(shape);
  return fixtures
    .filter((f) => f.seat !== undefined)
    .map((f) => ({ seat: f.seat!, x: f.x + f.width / 2, y: f.y + f.height / 2 }))
    .filter((s) => s.x >= b.x && s.x <= b.x + b.width && s.y >= b.y && s.y <= b.y + b.height)
    .sort((a, b) => a.seat - b.seat);
}

export function assignSeats<M>(seats: Seat[], team: M[]) {
  return {
    seats: seats.map((s, i) => ({ ...s, member: team[i] ?? null })),
    overflow: Math.max(0, team.length - seats.length),
  };
}

/** "Asha Rao" → "AR", "Lata" → "L", "  " → "?". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}
