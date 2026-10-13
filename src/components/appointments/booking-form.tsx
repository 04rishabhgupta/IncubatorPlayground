"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { AvailabilityBadge } from "@/components/company/availability-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fetchBusyTimes, requestAppointment } from "@/lib/appointments/actions";
import type { BookingContext } from "@/lib/appointments/queries";
import { BOOKING_RULES, overlaps, startTimes } from "@/lib/appointments/rules";
import { formatRange, wallTimeToUtc } from "@/lib/appointments/time";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/forms";

type Props = {
  context: BookingContext;
  zoneLabel: string;
  /** Building-local "today", latest bookable date and the server's "now" (ISO). */
  today: string;
  lastDay: string;
  now: string;
  initialMemberId?: string;
  /** The user's own upcoming meetings, for the double-booking warning. */
  myUpcoming: Array<{ start: string; end: string; companyName: string }>;
};

const control =
  "block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function BookingForm({ context, zoneLabel, today, lastDay, now, initialMemberId, myUpcoming }: Props) {
  const [state, action, pending] = useActionState(requestAppointment, initialFormState);
  const [, startTransition] = useTransition();

  const validInitial = context.members.some((m) => m.id === initialMemberId) ? initialMemberId! : "";
  const [memberId, setMemberId] = useState(state.values?.memberId ?? validInitial);
  const [date, setDate] = useState(state.values?.date ?? today);
  const [duration, setDuration] = useState(Number(state.values?.duration ?? 30));
  const [time, setTime] = useState(state.values?.time ?? "");
  const [meetingType, setMeetingType] = useState(state.values?.meetingType ?? "in_person");
  const [busy, setBusy] = useState<Array<{ start: string; end: string }>>([]);
  const [busyFor, setBusyFor] = useState("");

  // Load the representative's taken times for the chosen day.
  const busyKey = memberId && date ? `${memberId}|${date}` : "";
  useEffect(() => {
    if (!busyKey) return;
    let active = true;
    const [m, d] = busyKey.split("|");
    fetchBusyTimes(m, d, context.timezone).then((ranges) => {
      if (!active) return;
      setBusy(ranges);
      setBusyFor(busyKey);
    });
    return () => {
      active = false;
    };
  }, [busyKey, context.timezone]);
  const busyToday = useMemo(() => (busyKey && busyFor === busyKey ? busy : []), [busy, busyFor, busyKey]);

  // Start times: on the grid, inside opening hours, after the minimum notice, not taken.
  const options = useMemo(() => {
    const earliest = new Date(now).getTime() + BOOKING_RULES.minNoticeMinutes * 60_000;
    return startTimes(duration).map((t) => {
      const start = wallTimeToUtc({ date, time: t }, context.timezone);
      const end = start ? new Date(start.getTime() + duration * 60_000) : null;
      const tooSoon = !start || start.getTime() < earliest;
      const taken = Boolean(
        start && end && busyToday.some((b) => overlaps(new Date(b.start), new Date(b.end), start, end)),
      );
      return { value: t, start, end, disabled: tooSoon || taken, taken };
    });
  }, [date, duration, now, busyToday, context.timezone]);

  const chosen = options.find((o) => o.value === time && !o.disabled);
  const effectiveTime = chosen ? time : "";
  const clash = chosen
    ? myUpcoming.find((m) => overlaps(new Date(m.start), new Date(m.end), chosen.start!, chosen.end!))
    : undefined;
  const member = context.members.find((m) => m.id === memberId);
  const v = state.values;
  const e = state.fieldErrors;

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="companySlug" value={context.company.slug} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Who would you like to meet?</legend>
        <label htmlFor="memberId" className="sr-only">
          Representative
        </label>
        <select
          id="memberId"
          name="memberId"
          value={memberId}
          onChange={(ev) => setMemberId(ev.target.value)}
          className={control}
        >
          <option value="">Anyone at {context.company.name}</option>
          {context.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
              {m.job_title ? ` — ${m.job_title}` : ""}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <AvailabilityBadge availability={member ? member.availability : context.availability} showUpdated />
          <span>Availability is self-reported and doesn&apos;t confirm a slot.</span>
        </div>
        {e?.memberId && <p className="text-xs text-status-unavailable">{e.memberId[0]}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="date" className="block text-sm font-medium text-ink">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            min={today}
            max={lastDay}
            value={date}
            required
            onChange={(ev) => setDate(ev.target.value)}
            className={control}
          />
          {e?.date && <p className="text-xs text-status-unavailable">{e.date[0]}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="duration" className="block text-sm font-medium text-ink">
            Duration
          </label>
          <select
            id="duration"
            name="duration"
            value={duration}
            onChange={(ev) => setDuration(Number(ev.target.value))}
            className={control}
          >
            {BOOKING_RULES.durations.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} minutes` : d === 60 ? "1 hour" : `${d / 60} hours`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="time" className="block text-sm font-medium text-ink">
            Start time <span className="font-normal text-muted">({zoneLabel})</span>
          </label>
          <select
            id="time"
            name="time"
            value={effectiveTime}
            required
            aria-invalid={Boolean(e?.time)}
            aria-describedby="time-hint"
            onChange={(ev) => setTime(ev.target.value)}
            className={cn(control, e?.time && "border-status-unavailable")}
          >
            <option value="">Choose a time</option>
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.value}
                {o.taken ? " (booked)" : ""}
              </option>
            ))}
          </select>
          {e?.time && <p className="text-xs text-status-unavailable">{e.time[0]}</p>}
        </div>
      </div>
      <p id="time-hint" className="-mt-3 text-xs text-muted">
        Building time ({zoneLabel}). Meetings run between {BOOKING_RULES.openingHour}:00 and{" "}
        {BOOKING_RULES.closingHour}:00, at least an hour from now, up to {BOOKING_RULES.maxAdvanceDays} days
        ahead.
        {memberId ? " Times already booked for this person are disabled." : ""}
      </p>

      {chosen && (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
          {formatRange(chosen.start!, chosen.end!, context.timezone)}
        </p>
      )}
      {clash && (
        <Alert tone="warning" title="You already have a meeting at this time">
          It overlaps your appointment with {clash.companyName}. You can still send this request.
        </Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Meeting type</legend>
        <div className="flex flex-wrap gap-2">
          {[
            ["in_person", "In person (at their office)"],
            ["online", "Online (they'll send a link)"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40"
            >
              <input
                type="radio"
                name="meetingType"
                value={value}
                checked={meetingType === value}
                onChange={() => setMeetingType(value)}
                className="accent-brand-600"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="purpose" className="block text-sm font-medium text-ink">
          What would you like to discuss?
        </label>
        <textarea
          id="purpose"
          name="purpose"
          rows={4}
          maxLength={2000}
          required
          defaultValue={v?.purpose}
          aria-invalid={Boolean(e?.purpose)}
          className={cn(control, e?.purpose && "border-status-unavailable")}
        />
        {e?.purpose && <p className="text-xs text-status-unavailable">{e.purpose[0]}</p>}
      </div>

      <Alert tone="info">
        This sends a request. The appointment is only confirmed when {context.company.name} accepts it, and
        you&apos;ll get a notification either way.
      </Alert>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending request…" : "Send appointment request"}
      </Button>
    </form>
  );
}
