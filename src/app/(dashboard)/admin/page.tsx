import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireRole(["super_admin"], "/admin");
  const supabase = await createClient();

  // Counts run as the signed-in admin; RLS grants admins read access.
  const count = (query: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(query).then(({ count, error }) => (error ? null : (count ?? 0)));
  const companies = () => supabase.from("companies").select("id", { count: "exact", head: true });
  const profiles = () => supabase.from("profiles").select("id", { count: "exact", head: true });

  const [
    total,
    pending,
    approved,
    rejected,
    suspended,
    visitors,
    companyAccounts,
    appointments,
    officeRequests,
    pendingList,
  ] = await Promise.all([
    count(companies()),
    count(companies().eq("status", "pending")),
    count(companies().eq("status", "approved")),
    count(companies().eq("status", "rejected")),
    count(companies().eq("status", "suspended")),
    count(profiles().eq("role", "visitor")),
    count(profiles().eq("role", "company")),
    count(supabase.from("appointments").select("id", { count: "exact", head: true })),
    count(supabase.from("office_requests").select("company_id", { count: "exact", head: true })),
    supabase
      .from("companies")
      .select("id, name, business_email, created_at, industry:industries(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  const stats: Array<[string, number | null]> = [
    ["Total companies", total],
    ["Pending registrations", pending],
    ["Approved", approved],
    ["Rejected", rejected],
    ["Suspended", suspended],
    ["Registered visitors", visitors],
    ["Company accounts", companyAccounts],
    ["Appointments", appointments],
    ["Open office requests", officeRequests],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Platform overview"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/floor" variant="secondary">
              Floor layout
            </ButtonLink>
            <ButtonLink href="/admin/occupancy" variant="secondary">
              Occupancy
            </ButtonLink>
            <ButtonLink href="/admin/appointments" variant="secondary">
              Appointments
            </ButtonLink>
            <ButtonLink href="/admin/announcements" variant="secondary">
              Announcements
            </ButtonLink>
            <ButtonLink href="/admin/fitt-team" variant="secondary">
              FITT team
            </ButtonLink>
            <ButtonLink href="/admin/companies">Manage companies</ButtonLink>
          </div>
        }
      />
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(([label, value]) => (
            <Card key={label}>
              <CardBody>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink">{value ?? "—"}</dd>
              </CardBody>
            </Card>
          ))}
        </dl>

        <Card>
          <CardHeader
            title="Awaiting review"
            description="Oldest first."
            action={
              <ButtonLink href="/admin/companies?status=pending" variant="secondary" size="sm">
                Review all
              </ButtonLink>
            }
          />
          <CardBody>
            {pendingList.error ? (
              <Alert tone="error">Couldn&apos;t load pending registrations.</Alert>
            ) : pendingList.data.length === 0 ? (
              <p className="text-sm text-muted">No registrations are waiting for review.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pendingList.data.map((company) => (
                  <li key={company.id}>
                    <Link
                      href={`/admin/companies/${company.id}`}
                      className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 text-sm hover:bg-surface-muted"
                    >
                      <div>
                        <p className="font-medium text-ink">{company.name}</p>
                        <p className="text-muted">
                          {company.industry?.name ?? "No industry"} · {company.business_email}
                        </p>
                      </div>
                      <time className="text-muted" dateTime={company.created_at}>
                        {formatDate(company.created_at)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
