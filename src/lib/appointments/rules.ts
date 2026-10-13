import { addDays, utcToWallTime, wallTimeToUtc, type WallTime } from "./time";

/**
 * Booking rules, in one place. The same values are enforced by the database
 * (see the appointment_booking migration); this module gives fast, friendly
 * feedback in the form and re-checks on the server.
 */
export const BOOKING_RULES = {
  openingHour: 8, // earliest start (building time)
  closingHour: 20, // meetings must end by this hour
  minNoticeMinutes: 60,
  maxAdvanceDays: 60,
  slotMinutes: 15,
  durations: [15, 30, 45, 60, 90, 120] as const,
  maxPendingPerCompany: 3,
} as const;

export type Duration = (typeof BOOKING_RULES.durations)[number];

export type SlotCheck = { ok: true; start: Date; end: Date } | { ok: false; error: string };

/**
 * Validates a requested slot entered as building-local wall time. `now` is a
 * parameter so the rules can be tested deterministically.
 */
export function checkSlot(wall: WallTime, durationMinutes: number, timeZone: string, now: Date): SlotCheck {
  if (!(BOOKING_RULES.durations as readonly number[]).includes(durationMinutes)) {
    return { ok: false, error: "Choose one of the listed durations." };
  }
  const [hour, minute] = wall.time.split(":").map(Number);
  if (minute % BOOKING_RULES.slotMinutes !== 0) {
    return { ok: false, error: `Start times are every ${BOOKING_RULES.slotMinutes} minutes.` };
  }
  const start = wallTimeToUtc(wall, timeZone);
  if (!start) return { ok: false, error: "Choose a valid date and time." };
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + durationMinutes;
  if (startMinutes < BOOKING_RULES.openingHour * 60 || endMinutes > BOOKING_RULES.closingHour * 60) {
    return {
      ok: false,
      error: `Meetings must be between ${pad(BOOKING_RULES.openingHour)}:00 and ${pad(BOOKING_RULES.closingHour)}:00.`,
    };
  }
  if (start.getTime() < now.getTime() + BOOKING_RULES.minNoticeMinutes * 60_000) {
    return { ok: false, error: "Book at least 1 hour in advance." };
  }
  const lastDay = addDays(utcToWallTime(now, timeZone).date, BOOKING_RULES.maxAdvanceDays);
  if (wall.date > lastDay) {
    return { ok: false, error: `You can book up to ${BOOKING_RULES.maxAdvanceDays} days ahead.` };
  }
  return { ok: true, start, end };
}

/** All start times on the grid that fit a meeting of `durationMinutes` within opening hours. */
export function startTimes(durationMinutes: number) {
  const times: string[] = [];
  const first = BOOKING_RULES.openingHour * 60;
  const last = BOOKING_RULES.closingHour * 60 - durationMinutes;
  for (let m = first; m <= last; m += BOOKING_RULES.slotMinutes) {
    times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return times;
}

/** True when [aStart, aEnd) and [bStart, bEnd) overlap (back-to-back does not). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
