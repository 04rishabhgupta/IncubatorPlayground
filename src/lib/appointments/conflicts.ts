import { overlaps } from "./rules";

type Slot = { id: string; member_id: string | null; starts_at: string; ends_at: string; status: string };

export type Conflict<T extends Slot> =
  /** Accepting would break the one-meeting-per-representative rule (the database refuses it). */
  | { kind: "blocked"; with: T }
  /** Two general (no representative) meetings overlap — allowed, but worth knowing. */
  | { kind: "warning"; with: T };

/**
 * For the company inbox: which requests clash with an accepted meeting.
 * - pending with a representative + accepted for the same representative → blocked
 * - general request/meeting overlapping another accepted general meeting → warning
 */
export function findConflicts<T extends Slot>(appointments: T[]): Map<string, Conflict<T>> {
  const result = new Map<string, Conflict<T>>();
  const accepted = appointments.filter((a) => a.status === "accepted");
  const clash = (a: T, b: T) =>
    a.id !== b.id &&
    overlaps(new Date(a.starts_at), new Date(a.ends_at), new Date(b.starts_at), new Date(b.ends_at));

  for (const a of appointments) {
    if (a.status !== "pending" && a.status !== "accepted") continue;
    if (a.member_id) {
      if (a.status !== "pending") continue;
      const other = accepted.find((b) => b.member_id === a.member_id && clash(a, b));
      if (other) result.set(a.id, { kind: "blocked", with: other });
    } else {
      const other = accepted.find((b) => b.member_id === null && clash(a, b));
      if (other) result.set(a.id, { kind: "warning", with: other });
    }
  }
  return result;
}
