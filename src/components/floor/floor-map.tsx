"use client";

import { memo, useId, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { cn } from "@/lib/cn";
import { doorGeometry, fixturePlacement, wallThickness, windowGeometry } from "@/lib/floor/drawing";
import {
  fitLabel,
  labelFontSize,
  polygonPoints,
  shapeBounds,
  type FloorArea,
  type FloorDoor,
  type FloorEntrance,
  type FloorGeometry,
  type FloorWall,
  type FloorWindow,
  type Shape,
} from "@/lib/floor/geometry";
import type { FloorPlan, MapCompany, MapSpace } from "@/lib/floor/queries";
import type { Viewport } from "@/lib/floor/viewport";
import { FloorDefs, floorPatternId, shadowFilterId, symbolId } from "./floor-symbols";

/**
 * Pure SVG drawing of one floor. It renders whatever it is given (viewport,
 * selection, hover, dimming) and reports interactions through callbacks;
 * all state lives in the parent (FloorExplorer or the admin placement tool).
 *
 * Layers, bottom to top:
 *   1. floor + zones (areas)            static, memoised
 *   2. room fills                       per space (selection/hover tint)
 *   3. furniture, walls, windows, doors static, memoised
 *   4. room overlays                    labels, hit area, focus/selection ring
 * The static layers only depend on the layout, so zooming and panning (which
 * re-render this component with a new viewBox) don't redraw them.
 */

export type SpaceInteraction = {
  onSelect?: (space: MapSpace) => void;
  onHover?: (space: MapSpace | null) => void;
  /** Keyboard focus moved to a space (e.g. pan it into view). */
  onFocusSpace?: (space: MapSpace) => void;
};

type FloorMapProps = SpaceInteraction & {
  plan: Pick<FloorPlan, "floor" | "layout" | "spaces">;
  companiesBySpace: Map<string, MapCompany>;
  viewport: Viewport;
  selectedSpaceId?: string | null;
  hoveredSpaceId?: string | null;
  /** Spaces to fade out (e.g. companies that don't match the search). */
  dimmedSpaceIds?: Set<string>;
  className?: string;
  onPointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  ref?: Ref<SVGSVGElement>;
};

const availabilityLabel = {
  available: "Available",
  busy: "Busy",
  unavailable: "Unavailable",
  unknown: "Availability unknown",
} as const;

const availabilityFill = {
  available: "fill-status-available",
  busy: "fill-status-busy",
  unavailable: "fill-status-unavailable",
  unknown: "fill-status-unknown",
} as const;

export function spaceAccessibleName(space: MapSpace, company: MapCompany | undefined) {
  if (space.kind !== "office") {
    return [space.label, space.capacity ? `seats ${space.capacity}` : null].filter(Boolean).join(", ");
  }
  if (!company) return `${space.label}, vacant office`;
  const status = availabilityLabel[company.availability?.status ?? "unknown"];
  return [space.label, company.name, company.industry?.name, status].filter(Boolean).join(", ");
}

export function FloorMap({
  plan,
  companiesBySpace,
  viewport,
  selectedSpaceId,
  hoveredSpaceId,
  dimmedSpaceIds,
  onSelect,
  onHover,
  onFocusSpace,
  onPointerDown,
  className,
  ref,
}: FloorMapProps) {
  const { layout, spaces, floor } = plan;
  const interactive = Boolean(onSelect);
  // Unique per map so two maps on one page never share symbol/pattern ids.
  const prefix = `fm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const stateOf = (space: MapSpace) => ({
    selected: space.id === selectedSpaceId,
    hovered: space.id === hoveredSpaceId,
    dimmed: (dimmedSpaceIds?.has(space.id) ?? false) && space.id !== selectedSpaceId,
  });

  return (
    <svg
      ref={ref}
      viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block size-full touch-none select-none", className)}
      role="group"
      aria-label={`${floor.name} floor plan`}
      onPointerDown={onPointerDown}
    >
      <MemoDefs prefix={prefix} />
      <BaseLayer width={layout.width} height={layout.height} geometry={layout.geometry} prefix={prefix} />

      <g aria-hidden="true" data-layer="rooms">
        {spaces.map((space) => (
          <SpaceFill
            key={space.id}
            space={space}
            company={companiesBySpace.get(space.id)}
            {...stateOf(space)}
          />
        ))}
      </g>

      <DetailLayer geometry={layout.geometry} prefix={prefix} />
      <AreaLabelLayer areas={layout.geometry.areas} />

      <g data-layer="spaces">
        {spaces.map((space) => (
          <SpaceOverlay
            key={space.id}
            space={space}
            company={companiesBySpace.get(space.id)}
            {...stateOf(space)}
            interactive={interactive}
            onSelect={onSelect}
            onHover={onHover}
            onFocusSpace={onFocusSpace}
          />
        ))}
      </g>
    </svg>
  );
}

/** White outline behind label text so it stays readable over furniture. */
const HALO = "[paint-order:stroke] stroke-white/90 [stroke-width:4px] [stroke-linejoin:round]";

// --- Static layers -----------------------------------------------------------------

const MemoDefs = memo(FloorDefs);

const zoneFill: Record<FloorArea["kind"], string> = {
  corridor: "fill-zone-circulation",
  lift_lobby: "fill-zone-circulation",
  stairs: "fill-zone-service",
  lift: "fill-zone-service",
  restroom: "fill-zone-service",
  storage: "fill-zone-service",
  lounge: "fill-zone-social",
  pantry: "fill-zone-social",
  event: "fill-zone-meeting",
  phone_booth: "fill-zone-meeting",
  terrace: "fill-zone-outdoor",
  other: "fill-zone-circulation",
};

const BaseLayer = memo(function BaseLayer({
  width,
  height,
  geometry,
  prefix,
}: {
  width: number;
  height: number;
  geometry: FloorGeometry;
  prefix: string;
}) {
  return (
    <g aria-hidden="true" data-layer="base">
      <rect x={0} y={0} width={width} height={height} className="fill-floor" />
      <rect x={0} y={0} width={width} height={height} fill={`url(#${floorPatternId(prefix)})`} />
      {geometry.areas.map((area) => (
        <Area key={area.key} area={area} />
      ))}
    </g>
  );
});

const DetailLayer = memo(function DetailLayer({
  geometry,
  prefix,
}: {
  geometry: FloorGeometry;
  prefix: string;
}) {
  return (
    <g aria-hidden="true" className="pointer-events-none" data-layer="details">
      <g
        filter={geometry.fixtures.length ? `url(#${shadowFilterId(prefix)})` : undefined}
        data-layer="fixtures"
      >
        {geometry.fixtures.map((fixture, i) => {
          const p = fixturePlacement(fixture);
          return (
            <use
              key={i}
              href={`#${symbolId(prefix, fixture.kind)}`}
              x={p.x}
              y={p.y}
              width={p.width}
              height={p.height}
              transform={p.transform}
              data-fixture={fixture.kind}
            />
          );
        })}
      </g>
      <g data-layer="walls">
        {geometry.walls.map((wall, i) => (
          <Wall key={i} wall={wall} />
        ))}
      </g>
      <g data-layer="openings">
        {geometry.windows.map((win, i) => (
          <Window key={i} win={win} />
        ))}
        {geometry.doors.map((door, i) => (
          <Door key={i} door={door} />
        ))}
        {geometry.entrances.map((entrance) => (
          <Entrance key={entrance.key} entrance={entrance} />
        ))}
      </g>
    </g>
  );
});

function Wall({ wall }: { wall: FloorWall }) {
  const props = {
    points: polygonPoints(wall.points),
    strokeWidth: wallThickness(wall),
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    className: cn(
      "fill-none",
      wall.kind === "exterior" && "stroke-wall",
      wall.kind === "interior" && "stroke-wall-interior",
      wall.kind === "glass" && "stroke-upholstery-edge opacity-60",
    ),
    "data-wall": wall.kind,
  };
  return wall.closed ? <polygon {...props} /> : <polyline {...props} />;
}

function Window({ win }: { win: FloorWindow }) {
  const g = windowGeometry(win);
  return (
    <g data-window="">
      <rect {...g.gap} className="fill-glass" />
      {g.lines.map((l, i) => (
        <line key={i} {...l} className="stroke-upholstery-edge" strokeWidth={1.2} />
      ))}
    </g>
  );
}

function Door({ door }: { door: FloorDoor }) {
  const g = doorGeometry(door);
  return (
    <g data-door={door.kind}>
      <rect {...g.gap} className="fill-floor" />
      {g.leaves.map((leaf, i) => (
        <g key={i}>
          <path
            d={leaf.arc}
            className="fill-none stroke-wall-interior"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <line
            x1={leaf.hinge[0]}
            y1={leaf.hinge[1]}
            x2={leaf.tip[0]}
            y2={leaf.tip[1]}
            className="stroke-wall"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>
      ))}
      {g.sliding && (
        <line
          x1={door.x}
          y1={door.y}
          x2={door.orientation === "horizontal" ? door.x + door.width : door.x}
          y2={door.orientation === "horizontal" ? door.y : door.y + door.width}
          className="stroke-wall"
          strokeWidth={3}
        />
      )}
    </g>
  );
}

function ShapeElement({
  shape,
  className,
  strokeWidth,
  dashed,
}: {
  shape: Shape;
  className: string;
  strokeWidth?: number;
  dashed?: boolean;
}) {
  const dash = dashed ? "10 8" : undefined;
  if (shape.type === "rect") {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx ?? 10}
        className={className}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
    );
  }
  return (
    <polygon
      points={polygonPoints(shape.points)}
      className={className}
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
      strokeLinejoin="round"
    />
  );
}

function Area({ area }: { area: FloorArea }) {
  return (
    <g data-area={area.kind}>
      <ShapeElement shape={area.shape} className={cn(zoneFill[area.kind], "stroke-none")} />
    </g>
  );
}

/** Zone names sit above furniture and walls so a sofa can't hide "Lounge". */
const AreaLabelLayer = memo(function AreaLabelLayer({ areas }: { areas: FloorArea[] }) {
  return (
    <g aria-hidden="true" className="pointer-events-none" data-layer="area-labels">
      {areas.map((area) => (area.label ? <AreaLabel key={area.key} area={area} label={area.label} /> : null))}
    </g>
  );
});

function AreaLabel({ area, label }: { area: FloorArea; label: string }) {
  const b = shapeBounds(area.shape);
  const size = labelFontSize(b, { min: 12, max: 18, ratio: 0.1 });
  return (
    <text
      x={b.x + b.width / 2}
      y={b.y + b.height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      letterSpacing={size * 0.12}
      className={cn("fill-muted font-medium uppercase", HALO)}
    >
      {fitLabel(label, b.width - 24, size)}
    </text>
  );
}

function Entrance({ entrance }: { entrance: FloorEntrance }) {
  const horizontal = entrance.orientation === "horizontal";
  const { x, y, width } = entrance;
  // A gap in the wall, an arrow pointing inside, and the label just outside.
  const gap = horizontal ? { x, y: y - 8, width, height: 16 } : { x: x - 8, y, width: 16, height: width };
  const mid = horizontal ? { x: x + width / 2, y } : { x, y: y + width / 2 };
  const inward = horizontal ? (y > 0 ? -1 : 1) : x > 0 ? -1 : 1;
  const arrow = horizontal
    ? `${mid.x - 12},${mid.y + inward * 22} ${mid.x + 12},${mid.y + inward * 22} ${mid.x},${mid.y + inward * 40}`
    : `${mid.x + inward * 22},${mid.y - 12} ${mid.x + inward * 22},${mid.y + 12} ${mid.x + inward * 40},${mid.y}`;
  return (
    <g>
      <rect {...gap} className="fill-floor" />
      <polygon points={arrow} className="fill-accent-500" />
      {entrance.label && (
        <text
          x={horizontal ? mid.x : mid.x - inward * 22}
          y={horizontal ? mid.y - inward * 24 : mid.y}
          textAnchor={horizontal ? "middle" : inward < 0 ? "start" : "end"}
          dominantBaseline="central"
          fontSize={14}
          className="fill-accent-600 font-semibold"
        >
          {entrance.label}
        </text>
      )}
    </g>
  );
}

// --- Spaces ---------------------------------------------------------------------------

type SpaceState = { selected: boolean; hovered: boolean; dimmed: boolean };

/** Layer 2: the room's floor colour and outline, under furniture and walls. */
function SpaceFill({
  space,
  company,
  selected,
  hovered,
  dimmed,
}: SpaceState & { space: MapSpace; company: MapCompany | undefined }) {
  const vacant = space.kind === "office" && !company;
  const fill = selected
    ? "fill-office-selected"
    : hovered
      ? "fill-office-hover"
      : space.kind === "meeting_room"
        ? "fill-meeting"
        : space.kind === "reception"
          ? "fill-brand-50"
          : space.kind === "common_area"
            ? "fill-common"
            : vacant
              ? "fill-surface-muted"
              : "fill-office";
  return (
    <g
      className={cn("transition-opacity duration-200 motion-reduce:transition-none", dimmed && "opacity-35")}
    >
      <ShapeElement
        shape={space.shape}
        className={cn(
          fill,
          "stroke-space-border transition-colors duration-150 motion-reduce:transition-none",
        )}
        strokeWidth={2}
        dashed={vacant && !selected}
      />
    </g>
  );
}

type SpaceOverlayProps = SpaceInteraction &
  SpaceState & {
    space: MapSpace;
    company: MapCompany | undefined;
    interactive: boolean;
  };

/** Layer 4: labels, the click/focus target and the selection outline, above everything. */
function SpaceOverlay({
  space,
  company,
  selected,
  hovered,
  dimmed,
  interactive,
  onSelect,
  onHover,
  onFocusSpace,
}: SpaceOverlayProps) {
  const b = shapeBounds(space.shape);
  const isOffice = space.kind === "office";
  const vacant = isOffice && !company;
  const pad = Math.max(12, Math.min(b.width, b.height) * 0.07);
  const titleSize = labelFontSize(b);
  const smallSize = Math.max(11, Math.round(titleSize * 0.62));
  const status = company?.availability?.status ?? "unknown";

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(space);
    }
  }

  return (
    <g
      data-space-code={space.code}
      data-selected={selected || undefined}
      data-dimmed={dimmed || undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={spaceAccessibleName(space, company)}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        "outline-none transition-opacity duration-200 motion-reduce:transition-none",
        interactive && "cursor-pointer",
        dimmed && "opacity-35",
        "[&:focus-visible>.focus-ring]:visible",
      )}
      onClick={interactive ? () => onSelect?.(space) : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      onPointerEnter={interactive ? () => onHover?.(space) : undefined}
      onPointerLeave={interactive ? () => onHover?.(null) : undefined}
      onFocus={
        interactive
          ? () => {
              onHover?.(space);
              onFocusSpace?.(space);
            }
          : undefined
      }
      onBlur={interactive ? () => onHover?.(null) : undefined}
    >
      {/* Transparent hit area so the whole room is clickable above furniture and walls. */}
      <ShapeElement
        shape={space.shape}
        className={cn(
          "fill-transparent",
          selected ? "stroke-brand-600" : hovered ? "stroke-brand-400" : "stroke-transparent",
          "transition-colors duration-150 motion-reduce:transition-none",
        )}
        strokeWidth={selected ? 5 : 2}
      />
      {/* Keyboard focus ring, shown only for :focus-visible */}
      <g className="focus-ring invisible">
        <ShapeElement shape={space.shape} className="fill-none stroke-brand-500" strokeWidth={8} dashed />
      </g>

      <text
        x={b.x + pad}
        y={b.y + pad}
        dominantBaseline="hanging"
        fontSize={smallSize}
        className={cn("pointer-events-none fill-muted font-mono", HALO)}
      >
        {space.code}
      </text>

      {isOffice && company && (
        <g className="pointer-events-none">
          <text
            x={b.x + pad}
            y={b.y + b.height / 2 - titleSize * 0.35}
            fontSize={titleSize}
            className={cn("fill-ink font-semibold", HALO)}
          >
            {fitLabel(company.name, b.width - pad * 2, titleSize)}
          </text>
          {company.industry && (
            <text
              x={b.x + pad}
              y={b.y + b.height / 2 + titleSize * 0.9}
              fontSize={smallSize}
              className={cn("fill-muted", HALO)}
            >
              {fitLabel(company.industry.name, b.width - pad * 2, smallSize)}
            </text>
          )}
          <circle
            cx={b.x + pad + smallSize * 0.45}
            cy={b.y + b.height - pad - smallSize * 0.45}
            r={smallSize * 0.45}
            className={availabilityFill[status]}
          />
          <text
            x={b.x + pad + smallSize * 1.4}
            y={b.y + b.height - pad - smallSize * 0.45}
            dominantBaseline="central"
            fontSize={smallSize}
            className={cn("fill-ink", HALO)}
          >
            {status === "unknown" ? "Unknown" : availabilityLabel[status]}
          </text>
        </g>
      )}

      {vacant && (
        <text
          x={b.x + b.width / 2}
          y={b.y + b.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={smallSize * 1.15}
          className={cn("pointer-events-none fill-muted", HALO)}
        >
          Available office
        </text>
      )}

      {!isOffice && (
        <g className="pointer-events-none">
          <text
            x={b.x + b.width / 2}
            y={b.y + b.height / 2 - (space.capacity ? smallSize * 0.6 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={titleSize * 0.8}
            className={cn("fill-ink font-semibold", HALO)}
          >
            {fitLabel(space.label, b.width - pad * 2, titleSize * 0.8)}
          </text>
          {space.capacity && (
            <text
              x={b.x + b.width / 2}
              y={b.y + b.height / 2 + smallSize * 1.1}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={smallSize}
              className={cn("fill-muted", HALO)}
            >
              Seats {space.capacity}
            </text>
          )}
        </g>
      )}
    </g>
  );
}
