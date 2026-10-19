"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { shapeBounds, type Bounds, type FloorArea } from "@/lib/floor/geometry";
import { arrowDirections, nearestInDirection } from "@/lib/floor/navigation";
import type { FloorPlan, MapCompany, MapSpace } from "@/lib/floor/queries";
import { matchArea, matchCompany, matchSpace } from "@/lib/floor/search";
import { ExplorerPanel, type CompanyResult, type PanelSelection, type PlaceResult } from "./explorer-panel";
import { FloorMap, areaAccessibleName, isSelectableArea, navId, spaceAccessibleName } from "./floor-map";
import { MapControls, MapLegend } from "./map-controls";
import { useMapViewport } from "./use-map-viewport";

/**
 * The interactive floor: map + side panel. Selection lives in the URL
 * (?company=<slug>, ?space=<code> or ?area=<key>) via the History API, so the
 * back button and shared links work without reloading floor data from the server.
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
    pixelsPerUnit,
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
  const areas = useMemo(
    () => plan.layout.geometry.areas.filter(isSelectableArea),
    [plan.layout.geometry.areas],
  );
  const sharedSpaces = useMemo(() => plan.spaces.filter((s) => s.kind !== "office"), [plan.spaces]);

  // --- Selection (URL) ---------------------------------------------------------------
  const companySlug = searchParams.get("company");
  const spaceCode = searchParams.get("space");
  const areaKey = searchParams.get("area");
  const selection = useMemo<PanelSelection>(() => {
    if (areaKey) {
      const area = areas.find((a) => a.key === areaKey);
      if (area) return { type: "area", area };
    }
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
  }, [areaKey, areas, companySlug, spaceCode, plan.companies, plan.spaces, spacesById, companiesBySpace]);
  const selectedSpaceId = selection && selection.type !== "area" ? selection.space.id : null;
  const selectedAreaKey = selection?.type === "area" ? selection.area.key : null;
  const selectedBounds = selection
    ? shapeBounds(selection.type === "area" ? selection.area.shape : selection.space.shape)
    : null;

  const navigate = useCallback(
    (params: { company?: string; space?: string; area?: string } | null) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const key of ["company", "space", "area"]) next.delete(key);
      if (params?.company) next.set("company", params.company);
      if (params?.space) next.set("space", params.space);
      if (params?.area) next.set("area", params.area);
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

  const selectArea = useCallback(
    (area: FloorArea) => {
      if (consumeDrag()) return;
      navigate({ area: area.key });
    },
    [consumeDrag, navigate],
  );

  const selectPlace = useCallback(
    (place: PlaceResult) => {
      navigate(place.type === "area" ? { area: place.area.key } : { space: place.space.code });
      if (window.matchMedia("(max-width: 1023px)").matches) {
        rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    },
    [navigate],
  );

  const clearSelection = useCallback(() => navigate(null), [navigate]);

  // Fly to the selection whenever it changes (incl. back/forward and deep links).
  useEffect(() => {
    if (!ready || !selectedBounds) return;
    focus(selectedBounds);
  }, [ready, selectedSpaceId, selectedAreaKey, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Hover and filters ----------------------------------------------------------------
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [hoveredAreaKey, setHoveredAreaKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");

  const visibleCompanies = useMemo<CompanyResult[]>(
    () =>
      sortedCompanies.flatMap((company) => {
        if (industry && company.industry?.slug !== industry) return [];
        const space = company.space_id ? spacesById.get(company.space_id) : undefined;
        const hit = matchCompany(company, space, query);
        return hit ? [{ company, reason: hit.reason }] : [];
      }),
    [sortedCompanies, spacesById, query, industry],
  );

  // Shared places are listed (and searchable) unless an industry filter narrows the list to companies.
  const visiblePlaces = useMemo<PlaceResult[]>(() => {
    if (industry) return [];
    const spaces = sharedSpaces.flatMap((space): PlaceResult[] => {
      const hit = matchSpace(space, query);
      return hit ? [{ type: "space", space, reason: hit.reason }] : [];
    });
    const zones = areas.flatMap((area): PlaceResult[] => {
      const hit = matchArea(area, query);
      return hit ? [{ type: "area", area, reason: hit.reason }] : [];
    });
    return [...spaces, ...zones];
  }, [sharedSpaces, areas, query, industry]);

  const dimmedSpaceIds = useMemo(() => {
    if (!query.trim() && !industry) return undefined;
    const visible = new Set(visibleCompanies.map((r) => r.company.space_id));
    return new Set(plan.spaces.filter((s) => s.kind === "office" && !visible.has(s.id)).map((s) => s.id));
  }, [query, industry, visibleCompanies, plan.spaces]);

  const hovered = hoveredSpaceId ? spacesById.get(hoveredSpaceId) : undefined;
  const hoveredArea = hoveredAreaKey ? areas.find((a) => a.key === hoveredAreaKey) : undefined;

  // Everything keyboard navigation can move between: rooms and shared areas.
  const navTargets = useMemo(
    () => [
      ...plan.spaces.map((s) => ({ id: navId.space(s), bounds: shapeBounds(s.shape) })),
      ...areas.map((a) => ({ id: navId.area(a), bounds: shapeBounds(a.shape) })),
    ],
    [plan.spaces, areas],
  );

  // --- Keyboard ----------------------------------------------------------------------------
  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // On a room or area, the arrow keys move to the nearest one in that direction;
    // elsewhere on the map they pan.
    const from = (event.target as Element).closest?.("[data-nav-id]")?.getAttribute("data-nav-id");
    const direction = arrowDirections[event.key];
    if (from && direction) {
      event.preventDefault();
      const next = nearestInDirection(from, navTargets, direction);
      if (next) {
        containerRef.current
          ?.querySelector<SVGGElement>(`[data-nav-id="${CSS.escape(next.id)}"]`)
          ?.focus({ preventScroll: true });
      }
      return;
    }
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
            pixelsPerUnit={pixelsPerUnit}
            selectedSpaceId={selectedSpaceId}
            hoveredSpaceId={hoveredSpaceId}
            selectedAreaKey={selectedAreaKey}
            hoveredAreaKey={hoveredAreaKey}
            dimmedSpaceIds={dimmedSpaceIds}
            onSelect={selectSpace}
            onHover={(space) => setHoveredSpaceId(space?.id ?? null)}
            onFocusSpace={(space) => reveal(shapeBounds(space.shape))}
            onSelectArea={selectArea}
            onHoverArea={(area) => setHoveredAreaKey(area?.key ?? null)}
            onFocusArea={(area) => reveal(shapeBounds(area.shape))}
            onPointerDown={onPointerDown}
            className={cn(ready ? "opacity-100" : "opacity-0", "cursor-grab active:cursor-grabbing")}
          />

          {hovered && hovered.id !== selectedSpaceId && (
            <Tooltip {...spaceTooltip(hovered, companiesBySpace.get(hovered.id))} viewport={viewport} />
          )}
          {hoveredArea && hoveredArea.key !== selectedAreaKey && (
            <Tooltip
              title={hoveredArea.label ?? ""}
              detail={hoveredArea.info?.amenities.join(" · ") || "Shared space"}
              bounds={shapeBounds(hoveredArea.shape)}
              viewport={viewport}
            />
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
          {!selection
            ? ""
            : selection.type === "area"
              ? `Selected ${areaAccessibleName(selection.area)}`
              : `Selected ${spaceAccessibleName(selection.space, selection.type === "company" ? selection.company : undefined)}`}
        </p>
        <p className="hidden text-xs text-muted lg:block">
          Click an office or shared space for details. Scroll to zoom, drag to move, or use + − 0 and the
          arrow keys. Tab to a room, then use the arrow keys to move between rooms.
        </p>
      </section>

      <ExplorerPanel
        floorName={plan.floor.name}
        selection={selection}
        companies={visibleCompanies}
        places={visiblePlaces}
        spacesById={spacesById}
        industries={plan.industries}
        query={query}
        industry={industry}
        onQueryChange={setQuery}
        onIndustryChange={setIndustry}
        onSelectCompany={selectCompany}
        onHoverCompany={(company) => setHoveredSpaceId(company?.space_id ?? null)}
        onSelectPlace={selectPlace}
        onHoverPlace={(place) => {
          setHoveredSpaceId(place?.type === "space" ? place.space.id : null);
          setHoveredAreaKey(place?.type === "area" ? place.area.key : null);
        }}
        onClose={clearSelection}
      />
    </div>
  );
}

function spaceTooltip(space: MapSpace, company: MapCompany | undefined) {
  return {
    title: company ? company.name : space.label,
    detail: company
      ? [space.label, company.industry?.name].filter(Boolean).join(" · ")
      : space.kind === "office"
        ? "Vacant office"
        : space.capacity
          ? `Seats ${space.capacity}`
          : "Shared space",
    bounds: shapeBounds(space.shape),
  };
}

/** Floating label above the hovered room or area (pointer devices only). */
function Tooltip({
  title,
  detail,
  bounds: b,
  viewport,
}: {
  title: string;
  detail: string;
  bounds: Bounds;
  viewport: { x: number; y: number; width: number; height: number };
}) {
  const left = ((b.x + b.width / 2 - viewport.x) / viewport.width) * 100;
  const top = ((b.y - viewport.y) / viewport.height) * 100;
  if (left < 0 || left > 100 || top < 0 || top > 100) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 hidden -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg [@media(hover:hover)]:block"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <p className="font-semibold">{title}</p>
      <p className="text-white/75">{detail}</p>
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
