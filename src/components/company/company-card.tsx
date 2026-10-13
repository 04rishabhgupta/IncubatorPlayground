import Link from "next/link";
import type { DirectoryCompany } from "@/lib/companies/queries";
import { AvailabilityBadge } from "./availability-badge";
import { CompanyLogo } from "./company-logo";

export function CompanyCard({ company }: { company: DirectoryCompany }) {
  const summary = company.tagline ?? company.description;
  return (
    <li>
      <Link
        href={`/companies/${company.slug}`}
        className="group flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
      >
        <div className="flex items-start gap-3">
          <CompanyLogo name={company.name} path={company.logo_path} />
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-ink group-hover:text-brand-700">{company.name}</h2>
            <p className="text-sm text-muted">{company.industry?.name ?? "Industry not set"}</p>
          </div>
        </div>
        {summary && <p className="line-clamp-2 text-sm text-muted">{summary}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <AvailabilityBadge availability={company.availability} />
          {company.space && <span className="text-xs text-muted">{company.space.label}</span>}
        </div>
      </Link>
    </li>
  );
}
