import { describe, expect, it } from "vitest";
import { findConflicts } from "@/lib/appointments/conflicts";
import { BOOKING_RULES, checkSlot, overlaps, startTimes } from "@/lib/appointments/rules";
import {
  addDays,
  formatRange,
  utcToWallTime,
  wallTimeToUtc,
  zoneOffsetMinutes,
} from "@/lib/appointments/time";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

describe("time zones", () => {
  it("converts Kolkata wall time to UTC (+05:30, no DST)", () => {
    expect(wallTimeToUtc({ date: "2026-10-14", time: "10:30" }, IST)?.toISOString()).toBe(
      "2026-10-14T05:00:00.000Z",
    );
    expect(zoneOffsetMinutes(new Date("2026-01-01T00:00:00Z"), IST)).toBe(330);
  });

  it("handles daylight saving in New York", () => {
    // EDT (UTC-4) in summer, EST (UTC-5) in winter.
    expect(wallTimeToUtc({ date: "2026-07-01", time: "09:00" }, NY)?.toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(wallTimeToUtc({ date: "2026-12-01", time: "09:00" }, NY)?.toISOString()).toBe(
      "2026-12-01T14:00:00.000Z",
    );
  });

  it("rejects wall times that don't exist (spring-forward gap) and bad input", () => {
    expect(wallTimeToUtc({ date: "2026-03-08", time: "02:30" }, NY)).toBeNull();
    expect(wallTimeToUtc({ date: "2026-02-30", time: "10:00" }, IST)).toBeNull();
    expect(wallTimeToUtc({ date: "14/10/2026", time: "10:00" }, IST)).toBeNull();
    expect(wallTimeToUtc({ date: "2026-10-14", time: "25:00" }, IST)).toBeNull();
  });

  it("round-trips UTC → wall time → UTC", () => {
    const instant = new Date("2026-11-03T12:45:00Z");
    for (const zone of [IST, NY, "Europe/London", "Asia/Tokyo"]) {
      expect(wallTimeToUtc(utcToWallTime(instant, zone), zone)?.toISOString()).toBe(instant.toISOString());
    }
  });

  it("formats a range with the zone label", () => {
    const start = new Date("2026-10-14T05:00:00Z");
    const end = new Date("2026-10-14T05:30:00Z");
    const label = formatRange(start, end, IST);
    expect(label).toMatch(/14 Oct 2026/);
    expect(label).toMatch(/10:30/);
    expect(label).toMatch(/11:00/);
    expect(label).toMatch(/IST|GMT\+5:30/);
  });

  it("adds calendar days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("booking rules", () => {
  // "Now" is Tue 13 Oct 2026, 09:00 in Kolkata.
  const now = new Date("2026-10-13T03:30:00Z");
  const check = (date: string, time: string, duration = 30) => checkSlot({ date, time }, duration, IST, now);

  it("accepts a valid slot and returns exact UTC instants", () => {
    const result = check("2026-10-14", "10:30", 60);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.start.toISOString()).toBe("2026-10-14T05:00:00.000Z");
      expect(result.end.toISOString()).toBe("2026-10-14T06:00:00.000Z");
    }
  });

  it.each([
    ["before opening", "2026-10-14", "07:45", 30, /between 08:00 and 20:00/],
    ["ending after closing", "2026-10-14", "19:30", 60, /between 08:00 and 20:00/],
    ["off the 15-minute grid", "2026-10-14", "10:10", 30, /every 15 minutes/],
    ["an unsupported duration", "2026-10-14", "10:00", 20, /listed durations/],
    ["less than an hour from now", "2026-10-13", "09:45", 30, /at least 1 hour/],
    ["in the past", "2026-10-12", "10:00", 30, /at least 1 hour/],
    ["more than 60 days ahead", addDays("2026-10-13", 61), "10:00", 30, /up to 60 days/],
  ])("rejects a slot %s", (_label, date, time, duration, error) => {
    const result = check(date, time, duration);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });

  it("allows a meeting ending exactly at closing time and booking exactly 60 days ahead", () => {
    expect(check("2026-10-14", "19:00", 60).ok).toBe(true);
    expect(check(addDays("2026-10-13", 60), "10:00").ok).toBe(true);
  });

  it("lists start times that fit within opening hours", () => {
    const times = startTimes(120);
    expect(times[0]).toBe("08:00");
    expect(times.at(-1)).toBe("18:00");
    expect(times).toHaveLength(((18 - 8) * 60) / 15 + 1);
    expect(BOOKING_RULES.durations).toContain(15);
  });

  it("treats back-to-back meetings as not overlapping", () => {
    const t = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h, m));
    expect(overlaps(t(10), t(11), t(10, 30), t(11, 30))).toBe(true);
    expect(overlaps(t(10), t(11), t(11), t(11, 30))).toBe(false);
    expect(overlaps(t(10), t(12), t(10, 30), t(11))).toBe(true);
  });
});

describe("findConflicts", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h, m)).toISOString();
  const appt = (id: string, member: string | null, start: string, end: string, status: string) => ({
    id,
    member_id: member,
    starts_at: start,
    ends_at: end,
    status,
  });

  it("blocks pending requests for a representative who already has an accepted meeting", () => {
    const list = [
      appt("accepted", "rahul", at(10), at(11), "accepted"),
      appt("clash", "rahul", at(10, 30), at(11, 30), "pending"),
      appt("other-person", "priya", at(10, 30), at(11, 30), "pending"),
      appt("back-to-back", "rahul", at(11), at(11, 30), "pending"),
    ];
    const conflicts = findConflicts(list);
    expect(conflicts.get("clash")).toMatchObject({ kind: "blocked", with: { id: "accepted" } });
    expect(conflicts.has("other-person")).toBe(false);
    expect(conflicts.has("back-to-back")).toBe(false);
  });

  it("only warns about overlapping general meetings, including two accepted ones", () => {
    const list = [
      appt("g1", null, at(14), at(15), "accepted"),
      appt("g2", null, at(14, 30), at(15, 30), "accepted"),
      appt("g3", null, at(14, 45), at(15), "pending"),
      appt("cancelled", null, at(14), at(15), "cancelled"),
    ];
    const conflicts = findConflicts(list);
    expect(conflicts.get("g2")?.kind).toBe("warning");
    expect(conflicts.get("g3")?.kind).toBe("warning");
    expect(conflicts.has("cancelled")).toBe(false);
  });
});
