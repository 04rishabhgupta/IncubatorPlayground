"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AvailabilityBadge } from "@/components/company/availability-badge";
import { CompanyLogo } from "@/components/company/company-logo";
import { cn } from "@/lib/cn";
import { displayUrl } from "@/lib/format";
import type { FloorArea } from "@/lib/floor/geometry";
import { STARTUP_STAGES, stageLabel, teamSizeLabel } from "@/lib/companies/startup";
import type { IncubatorStaff, MapCompany, MapSpace } from "@/lib/floor/queries";
import { FittTeamList } from "./fitt-team";
import { areaKindName } from "@/lib/floor/search";

type Industry = { slug: string; name: string };

export type PanelSelection =
  | { type: "company"; company: MapCompany; space: MapSpace }
  | { type: "space"; space: MapSpace }
  | { type: "area"; area: FloorArea }
  | null;

/** A company in the list, with why it matched the search when that isn't its name. */
export type CompanyResult = { company: MapCompany; reason: string | null };

/** A shared place in the list: a room such as the boardroom, or an area such as the lounge. */
export type PlaceResult =
  | { type: "space"; space: MapSpace; reason: string | null }
  | { type: "area"; area: FloorArea; reason: string | null };

type PanelProps = {
  floorName: string;
  selection: PanelSelection;
  companies: CompanyResult[];
  places: PlaceResult[];
  spacesById: Map<string, MapSpace>;
  industries: Industry[];
  query: string;
  industry: string;
  stage: string;
  staff: IncubatorStaff[];
  onQueryChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  onStageChange: (value: string) => void;
  onSelectCompany: (company: MapCompany) => void;
  onHoverCompany: (company: MapCompany | null) => void;
  onSelectPlace: (place: PlaceResult) => void;
  onHoverPlace: (place: PlaceResult | null) => void;
  onClose: () => void;
};

export function ExplorerPanel(props: PanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectionKey = !props.selection
    ? null
    : props.selection.type === "company"
      ? props.selection.company.id
      : props.selection.type === "area"
        ? `area:${props.selection.area.key}`
        : props.selection.space.id;

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
  places,
  spacesById,
  industries,
  query,
  industry,
  stage,
  onQueryChange,
  onIndustryChange,
  onStageChange,
  onSelectCompany,
  onHoverCompany,
  onSelectPlace,
  onHoverPlace,
}: PanelProps) {
  const filtering = Boolean(query.trim() || industry || stage);
  const placeCount = places.length === 1 ? "1 place" : `${places.length} places`;
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
          placeholder="Search companies, people, rooms, amenities"
          aria-describedby="map-search-hint"
          autoComplete="off"
          maxLength={100}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <p id="map-search-hint" className="sr-only">
          Searches company names, industries, team members, office numbers and shared spaces.
        </p>
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
        <label htmlFor="map-stage" className="sr-only">
          Filter by stage
        </label>
        <select
          id="map-stage"
          value={stage}
          onChange={(e) => onStageChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="">All stages</option>
          {STARTUP_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div data-panel-list className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-4 pt-3 text-xs text-muted" aria-live="polite">
          {companies.length === 1 ? "1 company" : `${companies.length} companies`}
          {filtering ? " match" : ""}
          {filtering && places.length ? `, ${placeCount}` : ""}
        </p>
        {companies.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">
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
          <ul aria-label="Companies" className="p-2" onMouseLeave={() => onHoverCompany(null)}>
            {companies.map(({ company, reason }) => (
              <li key={company.id}>
                <CompanyCard
                  company={company}
                  space={company.space_id ? spacesById.get(company.space_id) : undefined}
                  reason={reason}
                  onSelect={onSelectCompany}
                  onHover={onHoverCompany}
                />
              </li>
            ))}
          </ul>
        )}

        {places.length > 0 && (
          <section aria-labelledby="panel-places" className="border-t border-border px-2 pb-2 pt-3">
            <h3 id="panel-places" className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Places
            </h3>
            <ul className="mt-1" onMouseLeave={() => onHoverPlace(null)}>
              {places.map((place) => (
                <li key={place.type === "area" ? `area:${place.area.key}` : place.space.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace(place)}
                    onMouseEnter={() => onHoverPlace(place)}
                    onFocus={() => onHoverPlace(place)}
                    onBlur={() => onHoverPlace(null)}
                    className="flex w-full flex-col rounded-lg px-2 py-2 text-left hover:bg-surface-muted"
                  >
                    <span className="text-sm font-medium text-ink">
                      {place.type === "area" ? place.area.label : place.space.label}
                    </span>
                    <span className="truncate text-xs text-muted">{place.reason ?? placeDetail(place)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

/** What kind of place it is and what it offers, without repeating its name ("Pantry · Pantry"). */
function placeDetail(place: NonNullable<PlaceResult>) {
  const [name, kind, extras] =
    place.type === "area"
      ? [place.area.label, areaKindName(place.area.kind), place.area.info?.amenities ?? []]
      : [
          place.space.label,
          kindLabel[place.space.kind],
          place.space.capacity ? [`seats ${place.space.capacity}`] : [],
        ];
  const parts = [kind === name ? null : kind, ...extras].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Shared space";
}

/** One company in the list: who, where, what they do, and who's around. */
function CompanyCard({
  company,
  space,
  reason,
  onSelect,
  onHover,
}: {
  company: MapCompany;
  space: MapSpace | undefined;
  reason: string | null;
  onSelect: (company: MapCompany) => void;
  onHover: (company: MapCompany | null) => void;
}) {
  const team = company.team.length;
  const available = company.team.filter((m) => m.availability?.status === "available").length;
  return (
    <button
      type="button"
      onClick={() => onSelect(company)}
      onMouseEnter={() => onHover(company)}
      onFocus={() => onHover(company)}
      onBlur={() => onHover(null)}
      className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-muted"
    >
      <CompanyLogo name={company.name} path={company.logo_path} size="sm" />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{company.name}</span>
          {space && (
            <span className="shrink-0 rounded bg-surface-muted px-1.5 py-px font-mono text-[11px] text-muted">
              {space.code}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted">
          {[company.industry?.name, stageLabel(company.stage), company.tagline].filter(Boolean).join(" · ")}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <AvailabilityBadge availability={company.availability} />
          {team > 0 && (
            <span className="text-xs text-muted">
              {available > 0 ? `${available} of ${team} team available` : `${team} in the team`}
            </span>
          )}
        </span>
        {reason && <span className="block truncate text-xs text-brand-700">{reason}</span>}
      </span>
    </button>
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
  staff,
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

  if (selection.type === "area") {
    const { area } = selection;
    const amenities = area.info?.amenities ?? [];
    return (
      <div className="space-y-3 p-5">
        {back}
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-ink outline-none">
          {area.label}
        </h2>
        <p className="text-sm text-muted">{areaKindName(area.kind)} · open to everyone on the floor</p>
        {area.info?.description && <p className="text-sm text-ink">{area.info.description}</p>}
        {amenities.length > 0 && (
          <section aria-labelledby="panel-amenities">
            <h3 id="panel-amenities" className="text-sm font-semibold text-ink">
              Amenities
            </h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <li key={a} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

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
            This office is currently vacant. Approved companies can request it from their dashboard.
          </p>
        )}
        {space.kind === "reception" && <FittTeamList staff={staff} headingId="panel-fitt" />}
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

        <StartupFacts company={company} />

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
        <Link
          href={`/companies/${company.slug}/book`}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          Request an appointment
        </Link>
      </div>
    </div>
  );
}

/** Stage, team size and tech stack, when the company has filled them in. */
function StartupFacts({ company }: { company: MapCompany }) {
  const facts = [
    ["Stage", stageLabel(company.stage)],
    ["Team size", teamSizeLabel(company.team_size)],
  ].filter((f): f is [string, string] => Boolean(f[1]));
  if (!facts.length && !company.tech_stack.length) return null;
  return (
    <section aria-label="Startup profile" className="space-y-2">
      {facts.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {company.tech_stack.length > 0 && (
        <ul aria-label="Tech stack" className="flex flex-wrap gap-1.5">
          {company.tech_stack.map((t) => (
            <li key={t} className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-ink">
              {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
