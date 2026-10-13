import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { countCompaniesByStatus, listCompaniesForAdmin, type CompanyStatus } from "@/lib/companies/queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Companies · Admin" };

const tabs: Array<{ status: CompanyStatus; label: string }> = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
  { status: "suspended", label: "Suspended" },
];

export default async function AdminCompaniesPage({ searchParams }: PageProps<"/admin/companies">) {
  await requireRole(["super_admin"], "/admin/companies");
  const params = await searchParams;
  const status = tabs.find((t) => t.status === params.status)?.status ?? "pending";
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  let companies, counts;
  try {
    [companies, counts] = await Promise.all([
      listCompaniesForAdmin({ status, q: q || undefined }),
      countCompaniesByStatus(),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Couldn&apos;t load companies. Please refresh the page.</Alert>;
  }

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Companies"
        action={
          <ButtonLink href="/admin" variant="secondary">
            Overview
          </ButtonLink>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by status">
        {tabs.map((tab) => (
          <Link
            key={tab.status}
            href={`/admin/companies?status=${tab.status}`}
            aria-current={tab.status === status ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              tab.status === status
                ? "bg-brand-600 text-white"
                : "border border-border bg-surface text-muted hover:text-ink",
            )}
          >
            {tab.label} <span className="ml-1 opacity-80">{counts[tab.status]}</span>
          </Link>
        ))}
      </nav>

      <form className="mb-4 flex gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <label htmlFor="q" className="sr-only">
          Search by company name
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by company name"
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button
          type="submit"
          className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
        >
          Search
        </button>
      </form>

      <Card>
        {companies.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {q ? "No companies match your search." : `No ${status} companies.`}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {companies.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/admin/companies/${company.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{company.name}</p>
                    <p className="truncate text-sm text-muted">
                      {company.industry?.name ?? "No industry"} · {company.business_email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted">
                    <span>Registered {formatDate(company.created_at)}</span>
                    <CompanyStatusBadge status={company.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
