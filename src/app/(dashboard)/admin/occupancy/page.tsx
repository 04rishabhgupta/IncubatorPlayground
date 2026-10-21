import type { Metadata } from "next";
import Link from "next/link";
import { AvailabilityBadge } from "@/components/company/availability-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/auth/session";
import type { AvailabilityStatus, CompanyStatus } from "@/lib/companies/queries";
import { summarizeOccupancy } from "@/lib/floor/occupancy";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Occupancy · Admin" };

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

export default async function OccupancyPage() {
  await requireRole(["super_admin"], "/admin/occupancy");
  const supabase = await createClient();

  const [floorsRes, officesRes, companiesRes, requestsRes, waitingRes] = await Promise.all([
    supabase.from("floors").select("id, slug, name, is_active").order("level"),
    supabase
      .from("floor_spaces")
      .select("id, floor_id, code, label, capacity")
      .eq("kind", "office")
      .order("sort_order"),
    supabase
      .from("companies")
      .select(
        "id, name, slug, space_id, status, team_size, team:company_team_members(id), availability:company_availability(status, updated_at)",
      )
      .not("space_id", "is", null),
    supabase.from("office_requests").select("space_id"),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .is("space_id", null),
  ]);
  const failed = [floorsRes, officesRes, companiesRes, requestsRes, waitingRes].some((r) => r.error);
  if (failed) {
    return <Alert tone="error">Occupancy couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }

  const companies = (companiesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    space_id: c.space_id,
    status: c.status,
    team_size: c.team_size,
    listed: c.team.length,
    availability: c.availability?.status ?? null,
    availabilityAt: c.availability?.updated_at ?? null,
  }));
  const floors = summarizeOccupancy(
    floorsRes.data ?? [],
    officesRes.data ?? [],
    companies,
    requestsRes.data ?? [],
  );
  const availabilityOf = new Map(companies.map((c) => [c.id, c]));

  const totals = floors.reduce(
    (t, f) => ({
      offices: t.offices + f.offices.length,
      occupied: t.occupied + f.occupied,
      desks: t.desks + f.desks,
      people: t.people + f.people,
    }),
    { offices: 0, occupied: 0, desks: 0, people: 0 },
  );
  const stats: Array<[string, string]> = [
    ["Occupancy", percent(totals.offices ? totals.occupied / totals.offices : null)],
    ["Offices occupied", `${totals.occupied} of ${totals.offices}`],
    ["Desks", `${totals.desks} for ${totals.people} people`],
    ["Office requests", String(requestsRes.data?.length ?? 0)],
    ["Approved, no office", String(waitingRes.count ?? 0)],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Occupancy"
        description="Who is where, how full each floor is, and which offices have been requested."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/floor" variant="secondary">
              Floor placement
            </ButtonLink>
            <ButtonLink href="/admin" variant="secondary">
              Overview
            </ButtonLink>
          </div>
        }
      />
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-xl font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        {floors.map((f) => (
          <Card key={f.floor.id}>
            <CardHeader
              title={`${f.floor.name}${f.floor.is_active ? "" : " (hidden from visitors)"}`}
              description={`${percent(f.rate)} occupied · ${f.occupied} of ${f.offices.length} offices · ${f.desks} desks for ${f.people} people`}
              action={
                <ButtonLink href={`/admin/floor?floor=${f.floor.slug}`} variant="secondary" size="sm">
                  Place companies
                </ButtonLink>
              }
            />
            <CardBody className="overflow-x-auto">
              {f.offices.length === 0 ? (
                <p className="text-sm text-muted">This floor has no offices.</p>
              ) : (
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Office</th>
                      <th className="py-2 pr-4 font-medium">Company</th>
                      <th className="py-2 pr-4 font-medium">People / desks</th>
                      <th className="py-2 pr-4 font-medium">Availability</th>
                      <th className="py-2 font-medium">Requests</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {f.offices.map((o) => {
                      const c = o.company ? availabilityOf.get(o.company.id) : undefined;
                      const over = o.capacity !== null && o.people > o.capacity;
                      return (
                        <tr key={o.id}>
                          <td className="py-2 pr-4">
                            <span className="font-mono text-xs text-muted">{o.code}</span>{" "}
                            <span className="text-ink">{o.label}</span>
                          </td>
                          <td className="py-2 pr-4">
                            {o.company ? (
                              <span className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/admin/companies/${o.company.id}`}
                                  className="text-brand-700 hover:underline"
                                >
                                  {o.company.name}
                                </Link>
                                {o.company.status !== "approved" && (
                                  <CompanyStatusBadge status={o.company.status as CompanyStatus} />
                                )}
                              </span>
                            ) : (
                              <span className="text-muted">Vacant</span>
                            )}
                          </td>
                          <td className={over ? "py-2 pr-4 font-medium text-red-700" : "py-2 pr-4 text-ink"}>
                            {o.company ? o.people : "—"} / {o.capacity ?? "—"}
                            {over && <span className="sr-only"> (over capacity)</span>}
                          </td>
                          <td className="py-2 pr-4">
                            {c ? (
                              <AvailabilityBadge
                                availability={
                                  c.availability && c.availabilityAt
                                    ? {
                                        status: c.availability as AvailabilityStatus,
                                        updated_at: c.availabilityAt,
                                      }
                                    : null
                                }
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 text-ink">{o.requests || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
