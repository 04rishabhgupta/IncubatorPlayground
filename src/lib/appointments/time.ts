/**
 * Time-zone helpers for appointments, with no date library.
 *
 * Appointments are stored as absolute instants (UTC `timestamptz`), but people
 * choose a *wall-clock* time in the building's time zone ("10:30 on 14 Oct in
 * Asia/Kolkata"). Converting between the two needs the zone's UTC offset at
 * that moment, which can change with daylight saving. `Intl.DateTimeFormat`
 * knows every IANA zone's rules, so we ask it.
 */

export type WallTime = { date: string; time: string }; // "2026-10-14", "10:30"

/** Calendar parts of an instant as seen in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (e.g. +330 for India). */
export function zoneOffsetMinutes(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The UTC instant at which the clock in `timeZone` shows `wall`.
 * Guesses with the offset at that time, then corrects once (enough for DST
 * jumps). Returns null for invalid input or wall times that don't exist
 * (e.g. 02:30 on a spring-forward night).
 */
export function wallTimeToUtc({ date, time }: WallTime, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;

  const naive = Date.UTC(y, mo - 1, da, h, mi);
  let guess = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  guess = naive - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  const result = new Date(guess);

  const check = zonedParts(result, timeZone);
  if (check.year !== y || check.month !== mo || check.day !== da || check.hour !== h || check.minute !== mi) {
    return null;
  }
  return result;
}

/** Wall-clock date and time of an instant in `timeZone`. */
export function utcToWallTime(instant: Date, timeZone: string): WallTime {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Short zone label for display, e.g. "IST" or "GMT+5:30". */
export function zoneLabel(instant: Date, timeZone: string) {
  const name = new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  return name ?? timeZone;
}

/** "Wed 14 Oct 2026" */
export function formatDay(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
}

/** "Wed 14 Oct 2026, 10:30 am – 11:00 am IST" */
export function formatRange(start: Date, end: Date, timeZone: string) {
  const clock = new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${formatDay(start, timeZone)}, ${clock.format(start)} – ${clock.format(end)} ${zoneLabel(start, timeZone)}`;
}

/** Calendar date `days` after `date` (both "YYYY-MM-DD"). */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}
