import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { CancelForm, CompleteForm, RespondForm } from "@/components/appointments/appointment-actions";
import { AppointmentCard } from "@/components/appointments/appointment-card";
import { AppointmentNotice } from "@/components/appointments/appointment-notice";
import { PageHeader } from "@/components/layout/page-header";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { findConflicts } from "@/lib/appointments/conflicts";
import { listCompanyAppointments, type Appointment } from "@/lib/appointments/queries";
import { formatRange } from "@/lib/appointments/time";
import { requireRole } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getOwnCompany } from "@/lib/companies/queries";

export const metadata: Metadata = { title: "Appointments · Company" };

const tabs = [
  { key: "pending", label: "Requests" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past & closed" },
] as const;
type Tab = (typeof tabs)[number]["key"];

export default async function CompanyAppointmentsPage({ searchParams }: PageProps<"/company/appointments">) {
  const { userId } = await requireRole(["company"], "/company/appointments");
  const params = await searchParams;
  const tab: Tab = tabs.find((t) => t.key === params.tab)?.key ?? "pending";

  let company, appointments: Appointment[];
  try {
    company = await getOwnCompany(userId);
    appointments = company ? await listCompanyAppointments(company.id) : [];
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Appointments couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }
  if (!company) {
    return <Alert tone="warning">No company is linked to this account.</Alert>;
  }

  const now = new Date().toISOString();
  const groups: Record<Tab, Appointment[]> = {
    pending: appointments.filter((a) => a.status === "pending" && a.ends_at > now),
    upcoming: appointments.filter((a) => a.status === "accepted" && a.ends_at > now),
    past: appointments
      .filter((a) => !(a.ends_at > now && (a.status === "pending" || a.status === "accepted")))
      .reverse(),
  };
  const conflicts = findConflicts(appointments.filter((a) => a.ends_at > now));
  const list = groups[tab];

  return (
    <>
      <LiveRefresh channel="company-appointments" tables={["appointments"]} />
      <PageHeader
        eyebrow={company.name}
        title="Appointments"
        description="Requests are only confirmed when you accept them. Accepted meetings for the same person can't overlap."
        action={
          <ButtonLink href="/company" variant="secondary">
            Back to dashboard
          </ButtonLink>
        }
      />

      <AppointmentNotice done={params.done} />
      <nav aria-label="Appointment views" className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/company/appointments?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              t.key === tab
                ? "bg-brand-600 text-white"
                : "border border-border bg-surface text-muted hover:text-ink",
            )}
          >
            {t.label} <span className="ml-1 opacity-80">{groups[t.key].length}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {tab === "pending"
            ? "No requests waiting for an answer."
            : tab === "upcoming"
              ? "No upcoming meetings."
              : "Nothing here yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const conflict = conflicts.get(a.id);
            const clashText = conflict
              ? formatRange(
                  new Date(conflict.with.starts_at),
                  new Date(conflict.with.ends_at),
                  conflict.with.timezone,
                )
              : "";
            const warning = conflict ? (
              <Alert tone={conflict.kind === "blocked" ? "error" : "warning"}>
                {conflict.kind === "blocked"
                  ? `${a.member?.full_name ?? "This person"} already has an accepted meeting (${clashText}). You can decline this request or ask the requester to pick another time.`
                  : `Overlaps another accepted company meeting (${clashText}). You can still accept it if someone else will attend.`}
              </Alert>
            ) : undefined;

            let actions;
            if (tab === "pending") {
              actions = (
                <RespondForm
                  appointmentId={a.id}
                  meetingType={a.meeting_type}
                  defaultLocation={company.space?.label ?? undefined}
                  blocked={conflict?.kind === "blocked"}
                />
              );
            } else if (tab === "upcoming") {
              actions = (
                <div className="flex flex-wrap items-start gap-2">
                  {a.starts_at <= now && <CompleteForm appointmentId={a.id} />}
                  <CancelForm appointmentId={a.id} />
                </div>
              );
            } else if (a.status === "accepted" && a.starts_at <= now) {
              actions = <CompleteForm appointmentId={a.id} />;
            }

            return (
              <AppointmentCard
                key={a.id}
                appointment={a}
                perspective="company"
                now={now}
                warning={warning}
                actions={actions}
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
