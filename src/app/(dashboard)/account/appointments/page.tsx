import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { CancelForm } from "@/components/appointments/appointment-actions";
import { AppointmentCard } from "@/components/appointments/appointment-card";
import { AppointmentNotice } from "@/components/appointments/appointment-notice";
import { PageHeader } from "@/components/layout/page-header";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { listMyAppointments } from "@/lib/appointments/queries";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "My appointments" };

export default async function MyAppointmentsPage({ searchParams }: PageProps<"/account/appointments">) {
  const { userId } = await requireSession("/account/appointments");
  const { done } = await searchParams;

  let appointments;
  try {
    appointments = await listMyAppointments(userId);
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Your appointments couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }

  const now = new Date().toISOString();
  const isUpcoming = (a: (typeof appointments)[number]) =>
    (a.status === "pending" || a.status === "accepted") && a.ends_at > now;
  const upcoming = appointments.filter(isUpcoming).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = appointments.filter((a) => !isUpcoming(a));

  return (
    <>
      <LiveRefresh channel="my-appointments" tables={["appointments"]} />
      <PageHeader
        title="My appointments"
        description="Requests you've sent to companies on the floor."
        action={
          <ButtonLink href="/directory" variant="secondary">
            Find a company
          </ButtonLink>
        }
      />
      <AppointmentNotice done={done} />

      <section aria-labelledby="upcoming-heading" className="space-y-3">
        <h2 id="upcoming-heading" className="text-lg font-semibold text-ink">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No upcoming appointments. Open a company on the floor map or in the directory to request one.
          </p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                perspective="requester"
                now={now}
                actions={<CancelForm appointmentId={a.id} />}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="past-heading" className="mt-10 space-y-3">
          <h2 id="past-heading" className="text-lg font-semibold text-ink">
            Past and closed ({past.length})
          </h2>
          <ul className="space-y-3">
            {past.map((a) => (
              <AppointmentCard key={a.id} appointment={a} perspective="requester" now={now} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
