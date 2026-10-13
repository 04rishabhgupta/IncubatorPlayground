import type { ReactNode } from "react";
import type { Appointment } from "@/lib/appointments/queries";
import { formatRange } from "@/lib/appointments/time";
import { AppointmentStatusBadge } from "./appointment-status-badge";

/**
 * One appointment, as seen by either side. `perspective` decides whether the
 * headline names the company (requester's view) or the requester (company's view).
 */
export function AppointmentCard({
  appointment: a,
  perspective,
  now,
  warning,
  actions,
}: {
  appointment: Appointment;
  perspective: "requester" | "company" | "admin";
  now: string;
  warning?: ReactNode;
  actions?: ReactNode;
}) {
  const ended = a.ends_at <= now;
  const when = formatRange(new Date(a.starts_at), new Date(a.ends_at), a.timezone);
  const requester = a.requester ? a.requester.full_name || a.requester.email : "A user";
  const headline =
    perspective === "requester"
      ? (a.company?.name ?? "Company")
      : perspective === "company"
        ? requester
        : `${requester} → ${a.company?.name ?? "Company"}`;
  const labelledBy = `appointment-${a.id}`;

  return (
    <li aria-labelledby={labelledBy} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={labelledBy} className="font-semibold text-ink">
            {headline}
          </h3>
          <p className="text-sm text-ink">{when}</p>
          <p className="text-sm text-muted">
            {a.member ? `With ${a.member.full_name}` : "With the company"} ·{" "}
            {a.meeting_type === "online" ? "Online" : "In person"}
          </p>
          {perspective !== "requester" && a.requester?.email && (
            <a href={`mailto:${a.requester.email}`} className="text-sm text-brand-700 hover:underline">
              {a.requester.email}
            </a>
          )}
        </div>
        <AppointmentStatusBadge status={a.status} ended={ended} />
      </div>

      <p className="whitespace-pre-line rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
        {a.purpose}
      </p>

      {(a.meeting_link || a.location_note || a.decision_note || a.cancellation_reason) && (
        <dl className="space-y-1 text-sm">
          {a.meeting_link && a.status === "accepted" && (
            <div className="flex gap-2">
              <dt className="text-muted">Meeting link:</dt>
              <dd>
                <a
                  href={a.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-brand-700 hover:underline"
                >
                  {a.meeting_link}
                </a>
              </dd>
            </div>
          )}
          {a.location_note && (
            <div className="flex gap-2">
              <dt className="text-muted">Location:</dt>
              <dd className="text-ink">{a.location_note}</dd>
            </div>
          )}
          {a.cancellation_reason && (
            <div className="flex gap-2">
              <dt className="text-muted">Cancellation reason:</dt>
              <dd className="text-ink">{a.cancellation_reason}</dd>
            </div>
          )}
          {a.decision_note && (
            <div className="flex gap-2">
              <dt className="text-muted">Note:</dt>
              <dd className="text-ink">{a.decision_note}</dd>
            </div>
          )}
        </dl>
      )}

      {warning}
      {actions}
    </li>
  );
}
