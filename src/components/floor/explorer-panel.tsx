"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AvailabilityBadge } from "@/components/company/availability-badge";
import { CompanyLogo } from "@/components/company/company-logo";
import { cn } from "@/lib/cn";
import { displayUrl } from "@/lib/format";
import type { MapCompany, MapSpace } from "@/lib/floor/queries";

type Industry = { slug: string; name: string };

export type PanelSelection =
  { type: "company"; company: MapCompany; space: MapSpace } | { type: "space"; space: MapSpace } | null;

type PanelProps = {
  floorName: string;
  selection: PanelSelection;
  companies: MapCompany[];
  spacesById: Map<string, MapSpace>;
  industries: Industry[];
  query: string;
  industry: string;
  onQueryChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  onSelectCompany: (company: MapCompany) => void;
  onHoverCompany: (company: MapCompany | null) => void;
  onClose: () => void;
};

export function ExplorerPanel(props: PanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectionKey = props.selection
    ? props.selection.type === "company"
      ? props.selection.company.id
      : props.selection.space.id
    : null;

  // Move focus to the details heading when the selection changes, so screen
  // reader and keyboard users land on the new content.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (
      selectionKey &&
      previous.current !== selectionKey &&
      document.activeElement?.closest("[data-panel-list]")
    ) {
      headingRef.current?.focus({ preventScroll: true });
    }
    previous.current = selectionKey;
  }, [selectionKey]);

  return (
    <aside
      aria-label="Companies on this floor"
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface"
    >
      {props.selection ? (
        <Details {...props} selection={props.selection} headingRef={headingRef} />
      ) : (
        <CompanyList {...props} />
      )}
    </aside>
  );
}

function CompanyList({
  floorName,
  companies,
  spacesById,
  industries,
  query,
  industry,
  onQueryChange,
  onIndustryChange,
  onSelectCompany,
  onHoverCompany,
}: PanelProps) {
  const filtering = Boolean(query.trim() || industry);
  return (
    <>
      <div className="space-y-2 border-b border-border p-4">
        <h2 className="font-semibold text-ink">Companies on {floorName}</h2>
        <label htmlFor="map-search" className="sr-only">
          Search companies on this floor
        </label>
        <input
          id="map-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search companies"
          autoComplete="off"
          maxLength={100}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <label htmlFor="map-industry" className="sr-only">
          Filter by industry
        </label>
        <select
          id="map-industry"
          value={industry}
          onChange={(e) => onIndustryChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      <p className="px-4 pt-3 text-xs text-muted" aria-live="polite">
        {companies.length === 1 ? "1 company" : `${companies.length} companies`}
        {filtering ? " match" : ""}
      </p>
      {companies.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted">
          {filtering
            ? "No companies on this floor match your search."
            : "No companies have been placed on this floor yet."}
          {!filtering && (
            <p className="mt-2">
              <Link href="/directory" className="text-brand-700 hover:underline">
                Browse the full directory
              </Link>
            </p>
          )}
        </div>
      ) : (
        <ul
          data-panel-list
          className="min-h-0 flex-1 overflow-y-auto p-2"
          onMouseLeave={() => onHoverCompany(null)}
        >
          {companies.map((company) => (
            <li key={company.id}>
              <button
                type="button"
                onClick={() => onSelectCompany(company)}
                onMouseEnter={() => onHoverCompany(company)}
                onFocus={() => onHoverCompany(company)}
                onBlur={() => onHoverCompany(null)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-muted"
              >
                <CompanyLogo name={company.name} path={company.logo_path} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{company.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[
                      company.industry?.name,
                      company.space_id ? spacesById.get(company.space_id)?.label : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <AvailabilityBadge availability={company.availability} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const kindLabel: Record<MapSpace["kind"], string> = {
  office: "Office",
  meeting_room: "Meeting room",
  common_area: "Common area",
  reception: "Reception",
};

function Details({
  selection,
  onClose,
  headingRef,
}: PanelProps & {
  selection: NonNullable<PanelSelection>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const back = (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
    >
      <span aria-hidden="true">←</span> All companies
    </button>
  );

  if (selection.type === "space") {
    const { space } = selection;
    return (
      <div className="space-y-3 p-5">
        {back}
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-ink outline-none">
          {space.label}
        </h2>
        <p className="text-sm text-muted">
          {kindLabel[space.kind]}
          {space.capacity ? ` · seats ${space.capacity}` : ""}
        </p>
        {space.kind === "office" && (
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
            This office is currently vacant. Companies interested in space on the floor can contact the
            platform admin.
          </p>
        )}
      </div>
    );
  }

  const { company, space } = selection;
  const location = [space.label, company.industry?.name].filter(Boolean).join(" · ");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-4 p-5">
        {back}
        <div className="flex items-start gap-3">
          <CompanyLogo name={company.name} path={company.logo_path} size="md" />
          <div className="min-w-0">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold leading-tight text-ink outline-none"
            >
              {company.name}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{location}</p>
          </div>
        </div>

        <div className="space-y-1">
          <AvailabilityBadge availability={company.availability} showUpdated />
          {company.availability?.note && <p className="text-sm text-muted">{company.availability.note}</p>}
          <p className="text-xs text-muted">
            Self-reported by the company. It doesn&apos;t confirm a meeting slot or that someone is in the
            office.
          </p>
        </div>

        {(company.tagline || company.description) && (
          <p className="line-clamp-5 whitespace-pre-line text-sm text-ink">
            {company.tagline ?? company.description}
          </p>
        )}

        <section aria-labelledby="panel-team">
          <h3 id="panel-team" className="text-sm font-semibold text-ink">
            Team
          </h3>
          {company.team.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No team members listed.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {company.team.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{member.full_name}</span>
                    {member.job_title && (
                      <span className="block truncate text-xs text-muted">{member.job_title}</span>
                    )}
                  </span>
                  <AvailabilityBadge availability={member.availability} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="panel-contact">
          <h3 id="panel-contact" className="text-sm font-semibold text-ink">
            Contact
          </h3>
          <ul className="mt-1 space-y-1 text-sm">
            <li>
              <a
                href={`mailto:${company.business_email}`}
                className="break-all text-brand-700 hover:underline"
              >
                {company.business_email}
              </a>
            </li>
            {company.phone && (
              <li>
                <a
                  href={`tel:${company.phone.replace(/\s/g, "")}`}
                  className="text-brand-700 hover:underline"
                >
                  {company.phone}
                </a>
              </li>
            )}
            {company.website && (
              <li>
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-brand-700 hover:underline"
                >
                  {displayUrl(company.website)}
                </a>
              </li>
            )}
          </ul>
        </section>

        <Link
          href={`/companies/${company.slug}`}
          className={cn(
            "inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700",
          )}
        >
          View full profile
        </Link>
      </div>
    </div>
  );
}
