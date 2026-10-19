"use client";

import { useMemo, useState } from "react";
import { FloorMap } from "@/components/floor/floor-map";
import { FIXTURE_KINDS, FIXTURES, FixtureShape } from "@/components/floor/floor-symbols";
import { MapControls, MapLegend } from "@/components/floor/map-controls";
import { useMapViewport } from "@/components/floor/use-map-viewport";
import type { FloorPlan } from "@/lib/floor/queries";

/**
 * Renderer preview for admins: draws a floor plan with the production
 * FloorMap and lists every furniture symbol. Nothing here is saved.
 * (In Phase 4R.6 this becomes the live preview of the layout JSON editor.)
 */
export function FloorPreview({ plan }: { plan: FloorPlan }) {
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
  } = useMapViewport(content);
  const companiesBySpace = useMemo(
    () => new Map(plan.companies.filter((c) => c.space_id).map((c) => [c.space_id!, c])),
    [plan.companies],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div
        ref={containerRef}
        className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-border bg-surface"
      >
        <FloorMap
          ref={svgRef}
          plan={plan}
          companiesBySpace={companiesBySpace}
          viewport={viewport}
          pixelsPerUnit={pixelsPerUnit}
          selectedSpaceId={selected}
          hoveredSpaceId={hovered}
          onSelect={(space) => {
            if (!consumeDrag()) setSelected((current) => (current === space.id ? null : space.id));
          }}
          onHover={(space) => setHovered(space?.id ?? null)}
          onPointerDown={onPointerDown}
          className={ready ? "opacity-100" : "opacity-0"}
        />
        <MapControls
          className="absolute right-3 top-3"
          zoom={zoom}
          maxZoom={maxZoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={reset}
        />
        <MapLegend className="absolute bottom-3 left-3 hidden sm:flex" />
      </div>

      <section aria-labelledby="symbols-heading">
        <h2 id="symbols-heading" className="mb-1 text-lg font-semibold text-ink">
          Furniture symbols ({FIXTURE_KINDS.length})
        </h2>
        <p className="mb-3 text-sm text-muted">
          Each piece is drawn at its default real-world size (40 floor units per metre) and adapts to the box
          it is given.
        </p>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {FIXTURE_KINDS.map((kind) => {
            const [w, h] = FIXTURES[kind].size;
            return (
              <li key={kind} className="rounded-lg border border-border bg-floor p-2 text-center">
                <svg viewBox={`-4 -4 ${w + 8} ${h + 8}`} className="mx-auto h-16 w-full" aria-hidden="true">
                  <FixtureShape kind={kind} width={w} height={h} />
                </svg>
                <span className="mt-1 block font-mono text-xs text-muted">{kind}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
