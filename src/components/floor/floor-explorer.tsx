"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { shapeBounds } from "@/lib/floor/geometry";
import type { FloorPlan, MapCompany, MapSpace } from "@/lib/floor/queries";
import { ExplorerPanel, type PanelSelection } from "./explorer-panel";
import { FloorMap, spaceAccessibleName } from "./floor-map";
import { MapControls, MapLegend } from "./map-controls";
import { useMapViewport } from "./use-map-viewport";

/**
 * The interactive floor: map + side panel. Selection lives in the URL
 * (?company=<slug> or ?space=<code>) via the History API, so the back button
 * and shared links work without reloading floor data from the server.
 */
export function FloorExplorer({ plan }: { plan: FloorPlan }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);

  const content = useMemo(
    () => ({ x: 0, y: 0, width: plan.layout.width, height: plan.layout.height }),
    [plan.layout.width, plan.layout.height],
  );
  const {
    containerRef,
    svgRef,
    viewport,
    ready,
    zoom,
    maxZoom,
    onPointerDown,
    consumeDrag,
    zoomIn,
    zoomOut,
    reset,
    pan,
    focus,
    reveal,
  } = useMapViewport(content);

  const spacesById = useMemo(() => new Map(plan.spaces.map((s) => [s.id, s])), [plan.spaces]);
  const companiesBySpace = useMemo(
    () => new Map(plan.companies.filter((c) => c.space_id).map((c) => [c.space_id!, c])),
    [plan.companies],
  );
  const sortedCompanies = useMemo(
    () => [...plan.companies].sort((a, b) => a.name.localeCompare(b.name)),
    [plan.companies],
  );

  // --- Selection (URL) ---------------------------------------------------------------
  const companySlug = searchParams.get("company");
  const spaceCode = searchParams.get("space");
  const selection = useMemo<PanelSelection>(() => {
    if (companySlug) {
      const company = plan.companies.find((c) => c.slug === companySlug);
      const space = company?.space_id ? spacesById.get(company.space_id) : undefined;
      if (company && space) return { type: "company", company, space };
    }
    if (spaceCode) {
      const space = plan.spaces.find((s) => s.code === spaceCode);
      if (space) {
        const company = companiesBySpace.get(space.id);
        return company ? { type: "company", company, space } : { type: "space", space };
      }
    }
    return null;
  }, [companySlug, spaceCode, plan.companies, plan.spaces, spacesById, companiesBySpace]);
  const selectedSpaceId = selection?.space.id ?? null;

  const navigate = useCallback(
    (params: { company?: string; space?: string } | null) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("company");
      next.delete("space");
      if (params?.company) next.set("company", params.company);
      if (params?.space) next.set("space", params.space);
      const query = next.toString();
      window.history.pushState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams],
  );

  const selectSpace = useCallback(
    (space: MapSpace) => {
      if (consumeDrag()) return; // the gesture was a pan, not a click
      const company = companiesBySpace.get(space.id);
      navigate(company ? { company: company.slug } : { space: space.code });
    },
    [companiesBySpace, consumeDrag, navigate],
  );

  const selectCompany = useCallback(
    (company: MapCompany) => {
      navigate({ company: company.slug });
      // On small screens the list sits below the map; bring the map back into view.
      if (window.matchMedia("(max-width: 1023px)").matches) {
        rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    },
    [navigate],
  );

  const clearSelection = useCallback(() => navigate(null), [navigate]);

  // Fly to the selected space whenever the selection changes (incl. back/forward and deep links).
  useEffect(() => {
    if (!ready || !selection) return;
    focus(shapeBounds(selection.space.shape));
  }, [ready, selectedSpaceId, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Hover and filters ----------------------------------------------------------------
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");

  const visibleCompanies = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return sortedCompanies.filter(
      (c) => (!q || c.name.toLocaleLowerCase().includes(q)) && (!industry || c.industry?.slug === industry),
    );
  }, [sortedCompanies, query, industry]);

  const dimmedSpaceIds = useMemo(() => {
    if (!query.trim() && !industry) return undefined;
    const visible = new Set(visibleCompanies.map((c) => c.space_id));
    return new Set(plan.spaces.filter((s) => s.kind === "office" && !visible.has(s.id)).map((s) => s.id));
  }, [query, industry, visibleCompanies, plan.spaces]);

  const hovered = hoveredSpaceId ? spacesById.get(hoveredSpaceId) : undefined;

  // --- Keyboard ----------------------------------------------------------------------------
  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const actions: Record<string, () => void> = {
      "+": zoomIn,
      "=": zoomIn,
      "-": zoomOut,
      _: zoomOut,
      "0": reset,
      ArrowLeft: () => pan(-0.2, 0),
      ArrowRight: () => pan(0.2, 0),
      ArrowUp: () => pan(0, -0.2),
      ArrowDown: () => pan(0, 0.2),
      Escape: clearSelection,
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  return (
    <div
      ref={rootRef}
      className="grid scroll-mt-16 gap-4 lg:h-[calc(100svh-4rem-2rem)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_380px]"
    >
      <section aria-labelledby="floor-heading" className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 id="floor-heading" className="text-lg font-semibold text-ink">
              {plan.floor.name}
            </h1>
            {plan.building && <p className="text-sm text-muted">{plan.building.name}</p>}
          </div>
          {plan.floors.length > 1 && <FloorSelector floors={plan.floors} current={plan.floor.slug} />}
        </div>

        <div
          ref={containerRef}
          onKeyDown={handleMapKeyDown}
          className="relative h-[55svh] min-h-[320px] overflow-hidden rounded-xl border border-border bg-surface lg:h-auto lg:flex-1"
        >
          <FloorMap
            ref={svgRef}
            plan={plan}
            companiesBySpace={companiesBySpace}
            viewport={viewport}
            selectedSpaceId={selectedSpaceId}
            hoveredSpaceId={hoveredSpaceId}
            dimmedSpaceIds={dimmedSpaceIds}
            onSelect={selectSpace}
            onHover={(space) => setHoveredSpaceId(space?.id ?? null)}
            onFocusSpace={(space) => reveal(shapeBounds(space.shape))}
            onPointerDown={onPointerDown}
            className={cn(ready ? "opacity-100" : "opacity-0", "cursor-grab active:cursor-grabbing")}
          />

          {hovered && hovered.id !== selectedSpaceId && (
            <Tooltip space={hovered} company={companiesBySpace.get(hovered.id)} viewport={viewport} />
          )}

          <MapControls
            className="absolute right-3 top-3"
            zoom={zoom}
            maxZoom={maxZoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={reset}
          />
          <MapLegend className="absolute bottom-3 left-3 hidden max-w-[calc(100%-1.5rem)] sm:flex" />
        </div>
        <MapLegend className="sm:hidden" />
        <p className="sr-only" aria-live="polite">
          {selection
            ? `Selected ${spaceAccessibleName(selection.space, selection.type === "company" ? selection.company : undefined)}`
            : ""}
        </p>
        <p className="hidden text-xs text-muted lg:block">
          Click an office for details. Scroll to zoom, drag to move, or use + − 0 and the arrow keys.
        </p>
      </section>

      <ExplorerPanel
        floorName={plan.floor.name}
        selection={selection}
        companies={visibleCompanies}
        spacesById={spacesById}
        industries={plan.industries}
        query={query}
        industry={industry}
        onQueryChange={setQuery}
        onIndustryChange={setIndustry}
        onSelectCompany={selectCompany}
        onHoverCompany={(company) => setHoveredSpaceId(company?.space_id ?? null)}
        onClose={clearSelection}
      />
    </div>
  );
}

/** Floating label above the hovered space (pointer devices only). */
function Tooltip({
  space,
  company,
  viewport,
}: {
  space: MapSpace;
  company: MapCompany | undefined;
  viewport: { x: number; y: number; width: number; height: number };
}) {
  const b = shapeBounds(space.shape);
  const left = ((b.x + b.width / 2 - viewport.x) / viewport.width) * 100;
  const top = ((b.y - viewport.y) / viewport.height) * 100;
  if (left < 0 || left > 100 || top < 0 || top > 100) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 hidden -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg [@media(hover:hover)]:block"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <p className="font-semibold">{company ? company.name : space.label}</p>
      <p className="text-white/75">
        {company
          ? [space.label, company.industry?.name].filter(Boolean).join(" · ")
          : space.kind === "office"
            ? "Vacant office"
            : space.capacity
              ? `Seats ${space.capacity}`
              : "Shared space"}
      </p>
    </div>
  );
}

function FloorSelector({ floors, current }: { floors: FloorPlan["floors"]; current: string }) {
  return (
    <form method="get" action="/" className="flex items-center gap-2">
      <label htmlFor="floor" className="text-sm text-muted">
        Floor
      </label>
      <select
        id="floor"
        name="floor"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
      >
        {floors.map((f) => (
          <option key={f.id} value={f.slug}>
            {f.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">Go</button>
      </noscript>
    </form>
  );
}
