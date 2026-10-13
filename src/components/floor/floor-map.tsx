"use client";

import type { KeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from "react";
import { cn } from "@/lib/cn";
import {
  fitLabel,
  labelFontSize,
  polygonPoints,
  shapeBounds,
  type FloorArea,
  type FloorEntrance,
  type Shape,
} from "@/lib/floor/geometry";
import type { FloorPlan, MapCompany, MapSpace } from "@/lib/floor/queries";
import type { Viewport } from "@/lib/floor/viewport";

/**
 * Pure SVG drawing of one floor. It renders whatever it is given (viewport,
 * selection, hover, dimming) and reports interactions through callbacks;
 * all state lives in the parent (FloorExplorer or the admin placement tool).
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
      <rect x={0} y={0} width={layout.width} height={layout.height} className="fill-floor" />

      <g aria-hidden="true">
        {layout.geometry.areas.map((area) => (
          <Area key={area.key} area={area} />
        ))}
      </g>

      <g>
        {spaces.map((space) => (
          <Space
            key={space.id}
            space={space}
            company={companiesBySpace.get(space.id)}
            selected={space.id === selectedSpaceId}
            hovered={space.id === hoveredSpaceId}
            dimmed={dimmedSpaceIds?.has(space.id) ?? false}
            interactive={interactive}
            onSelect={onSelect}
            onHover={onHover}
            onFocusSpace={onFocusSpace}
          />
        ))}
      </g>

      <g aria-hidden="true" className="pointer-events-none">
        {layout.geometry.walls.map((wall, i) =>
          wall.closed ? (
            <polygon
              key={i}
              points={polygonPoints(wall.points)}
              className="fill-none stroke-wall"
              strokeWidth={8}
              strokeLinejoin="round"
            />
          ) : (
            <polyline
              key={i}
              points={polygonPoints(wall.points)}
              className="fill-none stroke-wall"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ),
        )}
        {layout.geometry.entrances.map((entrance) => (
          <Entrance key={entrance.key} entrance={entrance} />
        ))}
      </g>
    </svg>
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

const areaFill: Record<FloorArea["kind"], string> = {
  corridor: "fill-corridor",
  lounge: "fill-common",
  pantry: "fill-common",
  restroom: "fill-corridor",
  stairs: "fill-corridor",
  lift: "fill-corridor",
  other: "fill-corridor",
};

function Area({ area }: { area: FloorArea }) {
  const b = shapeBounds(area.shape);
  const size = labelFontSize(b, { min: 12, max: 18, ratio: 0.1 });
  return (
    <g>
      <ShapeElement shape={area.shape} className={cn(areaFill[area.kind], "stroke-none")} />
      {area.label && (
        <text
          x={b.x + b.width / 2}
          y={b.y + b.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size}
          letterSpacing={size * 0.12}
          className="fill-muted font-medium uppercase"
        >
          {fitLabel(area.label, b.width - 24, size)}
        </text>
      )}
    </g>
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

type SpaceProps = SpaceInteraction & {
  space: MapSpace;
  company: MapCompany | undefined;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  interactive: boolean;
};

function Space({
  space,
  company,
  selected,
  hovered,
  dimmed,
  interactive,
  onSelect,
  onHover,
  onFocusSpace,
}: SpaceProps) {
  const b = shapeBounds(space.shape);
  const isOffice = space.kind === "office";
  const vacant = isOffice && !company;
  const pad = Math.max(12, Math.min(b.width, b.height) * 0.07);
  const titleSize = labelFontSize(b);
  const smallSize = Math.max(11, Math.round(titleSize * 0.62));

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
  const stroke = selected ? "stroke-brand-600" : hovered ? "stroke-brand-400" : "stroke-space-border";

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(space);
    }
  }

  const status = company?.availability?.status ?? "unknown";

  return (
    <g
      data-space-code={space.code}
      data-selected={selected || undefined}
      data-dimmed={(dimmed && !selected) || undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={spaceAccessibleName(space, company)}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        "outline-none transition-opacity duration-200 motion-reduce:transition-none",
        interactive && "cursor-pointer",
        dimmed && !selected && "opacity-35",
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
      <ShapeElement
        shape={space.shape}
        className={cn(fill, stroke, "transition-colors duration-150 motion-reduce:transition-none")}
        strokeWidth={selected ? 5 : 2}
        dashed={vacant && !selected}
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
        className="fill-muted font-mono"
      >
        {space.code}
      </text>

      {isOffice && company && (
        <>
          <text
            x={b.x + pad}
            y={b.y + b.height / 2 - titleSize * 0.35}
            fontSize={titleSize}
            className="fill-ink font-semibold"
          >
            {fitLabel(company.name, b.width - pad * 2, titleSize)}
          </text>
          {company.industry && (
            <text
              x={b.x + pad}
              y={b.y + b.height / 2 + titleSize * 0.9}
              fontSize={smallSize}
              className="fill-muted"
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
            className="fill-ink"
          >
            {status === "unknown" ? "Unknown" : availabilityLabel[status]}
          </text>
        </>
      )}

      {vacant && (
        <text
          x={b.x + b.width / 2}
          y={b.y + b.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={smallSize * 1.15}
          className="fill-muted"
        >
          Available office
        </text>
      )}

      {!isOffice && (
        <>
          <text
            x={b.x + b.width / 2}
            y={b.y + b.height / 2 - (space.capacity ? smallSize * 0.6 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={titleSize * 0.8}
            className="fill-ink font-semibold"
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
              className="fill-muted"
            >
              Seats {space.capacity}
            </text>
          )}
        </>
      )}
    </g>
  );
}
