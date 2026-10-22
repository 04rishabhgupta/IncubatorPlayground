import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { AppointmentCard } from "@/components/appointments/appointment-card";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { listAppointmentsForAdmin } from "@/lib/appointments/queries";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Appointments · Admin" };

export default async function AdminAppointmentsPage() {
  await requireRole(["super_admin"], "/admin/appointments");

  let data;
  try {
    data = await listAppointmentsForAdmin();
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Appointments couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }
  const now = new Date().toISOString();
  const stats: Array<[string, number]> = [
    ["Pending", data.counts.pending],
    ["Accepted", data.counts.accepted],
    ["Completed", data.counts.completed],
    ["Declined", data.counts.rejected],
    ["Cancelled", data.counts.cancelled],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Appointments"
        description="Read-only monitoring. Companies and requesters manage their own appointments."
        action={
          <ButtonLink href="/admin" variant="secondary">
            Overview
          </ButtonLink>
        }
      />
      <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface px-5 py-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mb-3 text-lg font-semibold text-ink">Latest 100 requests</h2>
      {data.appointments.length === 0 ? (
        <p className="text-sm text-muted">No appointments yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.appointments.map((a) => (
            <AppointmentCard key={a.id} appointment={a} perspective="admin" now={now} />
          ))}
        </ul>
      )}
    </>
  );
}
