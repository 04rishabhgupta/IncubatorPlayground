"use client";

import {
  memo,
  useId,
  useMemo,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { cn } from "@/lib/cn";
import {
  WALL_THICKNESS,
  detailLevel,
  doorGeometry,
  fixturePlacement,
  jambLines,
  openingRect,
  wallAt,
  wallThickness,
  windowGeometry,
} from "@/lib/floor/drawing";
import {
  fitLabel,
  polygonPoints,
  shapeBounds,
  type FloorArea,
  type FloorDoor,
  type FloorEntrance,
  type FloorGeometry,
  type FloorWall,
  type Bounds,
  type FloorWindow,
  type Shape,
} from "@/lib/floor/geometry";
import { placeLabel } from "@/lib/floor/labels";
import { assignSeats, initials, officeSeats, type Seat } from "@/lib/floor/seats";
import type { FloorPlan, MapCompany, MapSpace } from "@/lib/floor/queries";
import type { Viewport } from "@/lib/floor/viewport";
import { FixtureShape } from "./floor-symbols";

/**
 * Pure SVG drawing of one floor. It renders whatever it is given (viewport,
 * selection, hover, dimming) and reports interactions through callbacks;
 * all state lives in the parent (FloorExplorer or the admin placement tool).
 *
 * Layers, bottom to top:
 *   1. floor + zones (areas)                     static, memoised
 *   2. room fills                                per space (selection/hover tint)
 *   3. furniture, walls, windows, doors          static, memoised
 *   4. team seats, zone labels                   re-sized with the zoom
 *   5. room overlays                             label plates, hit area, focus/selection ring
 * The static layers only depend on the layout, so zooming and panning (which
 * re-render this component with a new viewBox) don't redraw them. Text is
 * sized in screen pixels (via `pixelsPerUnit`) so it stays readable at every
 * zoom, and `data-lod` on the root lets CSS hide fine furniture detail when
 * zoomed out.
 */

export type SpaceInteraction = {
  onSelect?: (space: MapSpace) => void;
  onHover?: (space: MapSpace | null) => void;
  /** Keyboard focus moved to a space (e.g. pan it into view). */
  onFocusSpace?: (space: MapSpace) => void;
  /** Shared areas (lounge, pantry …) become clickable when this is set. */
  onSelectArea?: (area: FloorArea) => void;
  onHoverArea?: (area: FloorArea | null) => void;
  onFocusArea?: (area: FloorArea) => void;
};

type FloorMapProps = SpaceInteraction & {
  plan: Pick<FloorPlan, "floor" | "layout" | "spaces">;
  companiesBySpace: Map<string, MapCompany>;
  viewport: Viewport;
  /** Screen pixels per floor unit at the current zoom (defaults to 1 before the map is measured). */
  pixelsPerUnit?: number;
  selectedSpaceId?: string | null;
  hoveredSpaceId?: string | null;
  selectedAreaKey?: string | null;
  hoveredAreaKey?: string | null;
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

const availabilityStroke = {
  available: "stroke-status-available",
  busy: "stroke-status-busy",
  unavailable: "stroke-status-unavailable",
  unknown: "stroke-status-unknown",
} as const;

/** Tinted background of the status chip on a room's label. */
const availabilityChip = {
  available: "fill-status-available/12",
  busy: "fill-status-busy/12",
  unavailable: "fill-status-unavailable/12",
  unknown: "fill-status-unknown/15",
} as const;

export function spaceAccessibleName(space: MapSpace, company: MapCompany | undefined) {
  if (space.kind !== "office") {
    return [space.label, space.capacity ? `seats ${space.capacity}` : null].filter(Boolean).join(", ");
  }
  if (!company) return `${space.label}, vacant office`;
  const status = availabilityLabel[company.availability?.status ?? "unknown"];
  return [space.label, company.name, company.industry?.name, status].filter(Boolean).join(", ");
}

/** Areas people go to (lounge, pantry …); corridors are just circulation. */
export function isSelectableArea(area: FloorArea) {
  return Boolean(area.label) && area.kind !== "corridor" && area.kind !== "lift_lobby";
}

export function areaAccessibleName(area: FloorArea) {
  const amenities = area.info?.amenities ?? [];
  return [area.label, "shared space", amenities.length ? `${amenities.join(", ")}` : null]
    .filter(Boolean)
    .join(", ");
}

/** Id used by keyboard navigation to find a room's or area's button in the map. */
export const navId = {
  space: (space: MapSpace) => `space:${space.id}`,
  area: (area: FloorArea) => `area:${area.key}`,
};

export function FloorMap({
  plan,
  companiesBySpace,
  viewport,
  pixelsPerUnit,
  selectedSpaceId,
  hoveredSpaceId,
  selectedAreaKey,
  hoveredAreaKey,
  dimmedSpaceIds,
  onSelect,
  onHover,
  onFocusSpace,
  onSelectArea,
  onHoverArea,
  onFocusArea,
  onPointerDown,
  className,
  ref,
}: FloorMapProps) {
  const { layout, spaces, floor } = plan;
  const interactive = Boolean(onSelect);
  // Unique per map so two maps on one page never share mask ids.
  const prefix = `fm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ppu = pixelsPerUnit && pixelsPerUnit > 0 ? pixelsPerUnit : 1;
  const lod = detailLevel(ppu);
  // Rugs lie flat, so labels may sit on them.
  const obstacles = useMemo(
    () => layout.geometry.fixtures.filter((f) => f.kind !== "rug"),
    [layout.geometry.fixtures],
  );
  const seatsBySpace = useMemo(
    () =>
      new Map(
        spaces
          .filter((s) => s.kind === "office")
          .map((s) => [s.id, officeSeats(s.shape, layout.geometry.fixtures)]),
      ),
    [spaces, layout.geometry.fixtures],
  );

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
      data-lod={lod}
      onPointerDown={onPointerDown}
    >
      <BaseLayer width={layout.width} height={layout.height} geometry={layout.geometry} />

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

      <DetailLayer width={layout.width} height={layout.height} geometry={layout.geometry} prefix={prefix} />

      <g aria-hidden="true" className="pointer-events-none" data-layer="seats">
        {lod > 0 &&
          spaces.map((space) => {
            const company = companiesBySpace.get(space.id);
            const seats = seatsBySpace.get(space.id);
            if (!company?.team.length || !seats?.length) return null;
            return (
              <TeamSeats
                key={space.id}
                seats={seats}
                team={company.team}
                ppu={ppu}
                lod={lod === 2 ? 2 : 1}
                dimmed={stateOf(space).dimmed}
              />
            );
          })}
      </g>

      <AreaLabelLayer areas={layout.geometry.areas} ppu={ppu} />

      <g data-layer="spaces">
        {spaces.map((space) => (
          <SpaceOverlay
            key={space.id}
            space={space}
            company={companiesBySpace.get(space.id)}
            {...stateOf(space)}
            ppu={ppu}
            lod={lod}
            obstacles={obstacles}
            seatCount={seatsBySpace.get(space.id)?.length ?? 0}
            interactive={interactive}
            onSelect={onSelect}
            onHover={onHover}
            onFocusSpace={onFocusSpace}
          />
        ))}
        {onSelectArea &&
          layout.geometry.areas
            .filter(isSelectableArea)
            .map((area) => (
              <AreaOverlay
                key={area.key}
                area={area}
                selected={area.key === selectedAreaKey}
                hovered={area.key === hoveredAreaKey}
                onSelect={onSelectArea}
                onHover={onHoverArea}
                onFocus={onFocusArea}
              />
            ))}
      </g>
    </svg>
  );
}

/** Hairline stroke that keeps its screen width at any zoom. */
const NON_SCALING = { vectorEffect: "non-scaling-stroke" } as const;

/** White outline behind free-standing text (zone names), `px` screen pixels wide. */
const halo = (unit: number, px = 3): CSSProperties => ({
  paintOrder: "stroke",
  stroke: "rgb(255 255 255 / 0.92)",
  strokeWidth: px * unit,
  strokeLinejoin: "round",
});

// --- Static layers -----------------------------------------------------------------

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
}: {
  width: number;
  height: number;
  geometry: FloorGeometry;
}) {
  return (
    <g aria-hidden="true" data-layer="base">
      <rect x={0} y={0} width={width} height={height} className="fill-floor" />
      {geometry.areas.map((area) => (
        <Area key={area.key} area={area} />
      ))}
    </g>
  );
});

/** Depth of the wall an opening sits on (exterior thickness for openings off any wall). */
function depthAt(
  walls: FloorWall[],
  x: number,
  y: number,
  length: number,
  orientation: FloorDoor["orientation"],
) {
  const wall = wallAt(walls, { x, y, length, orientation });
  return wall ? wallThickness(wall) : WALL_THICKNESS.exterior;
}

const DetailLayer = memo(function DetailLayer({
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
  const { walls } = geometry;
  const doors = geometry.doors.map((door) => ({
    door,
    depth: depthAt(walls, door.x, door.y, door.width, door.orientation),
  }));
  const windows = geometry.windows.map((win) => ({
    win,
    depth: depthAt(walls, win.x, win.y, win.length, win.orientation),
  }));
  const entrances = geometry.entrances.map((entrance) => ({
    entrance,
    depth: depthAt(walls, entrance.x, entrance.y, entrance.width, entrance.orientation),
  }));
  // Openings are cut out of the walls with a mask (rather than painted over),
  // so whatever is underneath — a selected room's tint — shows through.
  const cuts = [
    ...doors.map(({ door, depth }) => openingRect(door.x, door.y, door.width, door.orientation, depth + 2)),
    ...windows.map(({ win, depth }) => openingRect(win.x, win.y, win.length, win.orientation, depth + 2)),
    ...entrances.map(({ entrance: e, depth }) => openingRect(e.x, e.y, e.width, e.orientation, depth + 2)),
  ];
  const maskId = `${prefix}-openings`;
  const pad = 200;

  const interior = walls.filter((w) => w.kind === "interior");
  const glass = walls.filter((w) => w.kind === "glass");
  const exterior = walls.filter((w) => w.kind === "exterior");

  return (
    <g aria-hidden="true" className="pointer-events-none" data-layer="details">
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-pad}
          y={-pad}
          width={width + pad * 2}
          height={height + pad * 2}
        >
          <rect x={-pad} y={-pad} width={width + pad * 2} height={height + pad * 2} fill="white" />
          {cuts.map((r, i) => (
            <rect key={i} {...r} fill="black" />
          ))}
        </mask>
      </defs>

      <g className="fp-fixtures" data-layer="fixtures">
        {geometry.fixtures.map((fixture, i) => {
          const p = fixturePlacement(fixture);
          return (
            <g
              key={i}
              transform={`${p.transform ? `${p.transform} ` : ""}translate(${p.x} ${p.y})`}
              data-fixture={fixture.kind}
            >
              <FixtureShape kind={fixture.kind} width={p.width} height={p.height} />
            </g>
          );
        })}
      </g>

      <g data-layer="walls" mask={cuts.length ? `url(#${maskId})` : undefined}>
        {/* Partitions: a dark edge pass, then a lighter core, so joins merge cleanly. */}
        {interior.map((wall, i) => (
          <WallPath key={`e${i}`} wall={wall} className="stroke-wall-interior" />
        ))}
        {interior.map((wall, i) => (
          <WallPath
            key={`f${i}`}
            wall={wall}
            className="stroke-wall-partition"
            inset={Math.min(1.5, wallThickness(wall) * 0.2)}
            kind="interior"
          />
        ))}
        {/* Glass: framed edges, a pale pane and a glazing line, drawn like a window. */}
        {glass.map((wall, i) => (
          <g key={`g${i}`}>
            <WallPath wall={wall} className="stroke-glass-line" />
            <WallPath
              wall={wall}
              className="stroke-glass"
              inset={Math.min(1.2, wallThickness(wall) * 0.15)}
              kind="glass"
            />
            <WallPath wall={wall} className="stroke-glass-line" hairline={0.8} />
          </g>
        ))}
        {exterior.map((wall, i) => (
          <WallPath key={`x${i}`} wall={wall} className="stroke-wall" kind="exterior" />
        ))}
      </g>

      <g data-layer="openings">
        {windows.map(({ win, depth }, i) => (
          <Window key={i} win={win} depth={depth} />
        ))}
        {doors.map(({ door, depth }, i) => (
          <Door key={i} door={door} depth={depth} />
        ))}
        {entrances.map(({ entrance, depth }) => (
          <Entrance key={entrance.key} entrance={entrance} depth={depth} width={width} height={height} />
        ))}
      </g>
    </g>
  );
});

/**
 * A wall as one thick stroke along its centre line, with mitred corners so
 * rooms get crisp right angles. `inset` thins it by that much on each side
 * (the partition core); `hairline` draws a screen-width line instead.
 */
function WallPath({
  wall,
  className,
  inset = 0,
  hairline,
  kind,
}: {
  wall: FloorWall;
  className: string;
  inset?: number;
  hairline?: number;
  kind?: FloorWall["kind"];
}) {
  const props = {
    points: polygonPoints(wall.points),
    strokeWidth: hairline ?? Math.max(0.5, wallThickness(wall) - inset * 2),
    strokeLinejoin: "miter" as const,
    strokeLinecap: wall.closed ? undefined : ("square" as const),
    style: hairline ? NON_SCALING : undefined,
    className: cn("fill-none", className),
    "data-wall": kind,
  };
  return wall.closed ? <polygon {...props} /> : <polyline {...props} />;
}

function Jambs({ lines }: { lines: ReturnType<typeof jambLines> }) {
  return (
    <>
      {lines.map((l, i) => (
        <line key={i} {...l} className="stroke-wall" strokeWidth={1} style={NON_SCALING} />
      ))}
    </>
  );
}

function Window({ win, depth }: { win: FloorWindow; depth: number }) {
  const g = windowGeometry(win, depth);
  return (
    <g data-window="">
      <rect {...g.gap} className="fill-glass" />
      {g.frame.map((l, i) => (
        <line key={`f${i}`} {...l} className="stroke-wall" strokeWidth={0.8} style={NON_SCALING} />
      ))}
      {g.glass.map((l, i) => (
        <line key={`g${i}`} {...l} className="stroke-glass-line" strokeWidth={0.8} style={NON_SCALING} />
      ))}
      <Jambs lines={g.jambs} />
    </g>
  );
}

function Door({ door, depth }: { door: FloorDoor; depth: number }) {
  const g = doorGeometry(door, depth);
  return (
    <g data-door={door.kind}>
      {/* Threshold: the floor carries on through the opening. */}
      <rect {...g.gap} className="fill-zone-circulation" />
      <Jambs lines={g.jambs} />
      {g.leaves.map((leaf, i) => (
        <g key={i}>
          <path d={leaf.arc} className="fill-none stroke-door-swing" strokeWidth={0.7} style={NON_SCALING} />
          <line
            x1={leaf.hinge[0]}
            y1={leaf.hinge[1]}
            x2={leaf.tip[0]}
            y2={leaf.tip[1]}
            className="stroke-wall"
            strokeWidth={1.8}
            strokeLinecap="square"
            style={NON_SCALING}
          />
        </g>
      ))}
      {g.panels.map((panel, i) => (
        <rect key={i} {...panel} className="fill-ceramic stroke-wall" strokeWidth={0.8} style={NON_SCALING} />
      ))}
    </g>
  );
}

function ShapeElement({
  shape,
  className,
  strokeWidth,
  dashed,
  style,
}: {
  shape: Shape;
  className: string;
  strokeWidth?: number;
  dashed?: boolean;
  style?: CSSProperties;
}) {
  const dash = dashed ? "6 4" : undefined;
  if (shape.type === "rect") {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx ?? 0}
        className={className}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        style={style}
      />
    );
  }
  return (
    <polygon
      points={polygonPoints(shape.points)}
      className={className}
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
      strokeLinejoin="miter"
      style={style}
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
const AreaLabelLayer = memo(function AreaLabelLayer({ areas, ppu }: { areas: FloorArea[]; ppu: number }) {
  return (
    <g aria-hidden="true" className="pointer-events-none" data-layer="area-labels">
      {areas.map((area) =>
        area.label ? <AreaLabel key={area.key} area={area} label={area.label} ppu={ppu} /> : null,
      )}
    </g>
  );
});

function AreaLabel({ area, label, ppu }: { area: FloorArea; label: string; ppu: number }) {
  const unit = 1 / ppu;
  const b = shapeBounds(area.shape);
  const px = 10;
  const size = px * unit;
  const inset = 8 * unit;
  // Circulation is labelled in the middle (it's empty); furnished zones in a
  // corner, like room tags on a drawing, so the label never lands on a sofa.
  const centred = area.kind === "corridor" || area.kind === "lift_lobby";
  const text = fitLabel(label, b.width * ppu - 16 - label.length * px * 0.12, px);
  return (
    <text
      x={centred ? b.x + b.width / 2 : b.x + inset}
      y={centred ? b.y + b.height / 2 : b.y + inset}
      textAnchor={centred ? "middle" : "start"}
      dominantBaseline={centred ? "central" : "hanging"}
      fontSize={size}
      letterSpacing={size * 0.12}
      className="fill-muted font-medium uppercase"
      style={halo(unit)}
    >
      {text}
    </text>
  );
}

function Entrance({
  entrance,
  depth,
  width,
  height,
}: {
  entrance: FloorEntrance;
  depth: number;
  width: number;
  height: number;
}) {
  const horizontal = entrance.orientation === "horizontal";
  const { x, y } = entrance;
  const length = entrance.width;
  // Inward = towards the middle of the floor.
  const inward: 1 | -1 = horizontal ? (y > height / 2 ? -1 : 1) : x > width / 2 ? -1 : 1;
  const doors = doorGeometry(
    { x, y, width: length, orientation: entrance.orientation, swing: inward, hinge: "start", kind: "double" },
    depth,
  );
  const mid = horizontal ? { x: x + length / 2, y } : { x, y: y + length / 2 };
  // Arrow just outside the building, pointing in; label beyond it.
  const out = -inward;
  const tipOff = depth / 2 + 4;
  const baseOff = tipOff + 14;
  const arrow = horizontal
    ? `${mid.x - 9},${mid.y + out * baseOff} ${mid.x + 9},${mid.y + out * baseOff} ${mid.x},${mid.y + out * tipOff}`
    : `${mid.x + out * baseOff},${mid.y - 9} ${mid.x + out * baseOff},${mid.y + 9} ${mid.x + out * tipOff},${mid.y}`;
  // The label sits beside the arrow, so it never falls off the drawing.
  const labelMid = (tipOff + baseOff) / 2;
  return (
    <g data-entrance="">
      <rect {...doors.gap} className="fill-zone-circulation" />
      <Jambs lines={doors.jambs} />
      {doors.leaves.map((leaf, i) => (
        <g key={i}>
          <path d={leaf.arc} className="fill-none stroke-door-swing" strokeWidth={0.7} style={NON_SCALING} />
          <line
            x1={leaf.hinge[0]}
            y1={leaf.hinge[1]}
            x2={leaf.tip[0]}
            y2={leaf.tip[1]}
            className="stroke-glass-line"
            strokeWidth={1.8}
            style={NON_SCALING}
          />
        </g>
      ))}
      <polygon points={arrow} className="fill-accent-500" />
      {entrance.label && (
        <text
          x={horizontal ? mid.x + 14 : mid.x + out * labelMid}
          y={horizontal ? mid.y + out * labelMid : mid.y + 14}
          textAnchor={horizontal ? "start" : "middle"}
          dominantBaseline={horizontal ? "central" : "hanging"}
          fontSize={12}
          className="fill-accent-600 font-semibold"
        >
          {entrance.label}
        </text>
      )}
    </g>
  );
}

/**
 * A shared area as a button: the zone itself is drawn in the base layer and
 * named in the zone-label layer; this adds the click/focus target and the
 * selection outline on top.
 */
function AreaOverlay({
  area,
  selected,
  hovered,
  onSelect,
  onHover,
  onFocus,
}: {
  area: FloorArea;
  selected: boolean;
  hovered: boolean;
  onSelect: (area: FloorArea) => void;
  onHover?: (area: FloorArea | null) => void;
  onFocus?: (area: FloorArea) => void;
}) {
  return (
    <g
      data-area-key={area.key}
      data-nav-id={navId.area(area)}
      data-selected={selected || undefined}
      role="button"
      tabIndex={0}
      aria-label={areaAccessibleName(area)}
      aria-pressed={selected}
      className="cursor-pointer outline-none [&:focus-visible>.focus-ring]:visible"
      onClick={() => onSelect(area)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(area);
        }
      }}
      onPointerEnter={() => onHover?.(area)}
      onPointerLeave={() => onHover?.(null)}
      onFocus={() => {
        onHover?.(area);
        onFocus?.(area);
      }}
      onBlur={() => onHover?.(null)}
    >
      <ShapeElement
        shape={area.shape}
        className={cn(
          selected
            ? "fill-brand-500/10 stroke-brand-600"
            : hovered
              ? "fill-brand-500/5 stroke-brand-400"
              : "fill-transparent stroke-transparent",
          "transition-colors duration-150 motion-reduce:transition-none",
        )}
        strokeWidth={selected ? 2.5 : 1.5}
        style={NON_SCALING}
      />
      <g className="focus-ring invisible">
        <ShapeElement
          shape={area.shape}
          className="fill-none stroke-brand-500"
          strokeWidth={3}
          style={NON_SCALING}
          dashed
        />
      </g>
    </g>
  );
}

// --- Spaces ---------------------------------------------------------------------------

type SpaceState = { selected: boolean; hovered: boolean; dimmed: boolean };

/**
 * Layer 4: the office's public team at their numbered seats, in team order.
 * On the whole-floor view each occupied chair gets an availability dot; close
 * up, a badge with the member's initials ringed in their status colour.
 */
function TeamSeats({
  seats,
  team,
  ppu,
  lod,
  dimmed,
}: {
  seats: Seat[];
  team: MapCompany["team"];
  ppu: number;
  lod: 1 | 2;
  dimmed: boolean;
}) {
  const unit = 1 / ppu;
  const assigned = assignSeats(seats, team).seats;
  return (
    <g
      className={cn("transition-opacity duration-200 motion-reduce:transition-none", dimmed && "opacity-35")}
    >
      {assigned.map(({ seat, x, y, member }) => {
        if (!member) return null;
        const status = member.availability?.status ?? "unknown";
        if (lod === 1) {
          return (
            <circle
              key={seat}
              cx={x}
              cy={y}
              r={3.5 * unit}
              className={cn(availabilityFill[status], "stroke-surface")}
              strokeWidth={1}
              style={NON_SCALING}
              data-seat={seat}
            />
          );
        }
        return (
          <g key={seat} data-seat={seat}>
            <circle
              cx={x}
              cy={y}
              r={9 * unit}
              className={cn("fill-surface", availabilityStroke[status])}
              strokeWidth={2}
              style={NON_SCALING}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={7.5 * unit}
              className="fill-ink font-semibold"
            >
              {initials(member.full_name)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

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
        strokeWidth={1}
        style={NON_SCALING}
        dashed={vacant && !selected}
      />
    </g>
  );
}

type SpaceOverlayProps = SpaceInteraction &
  SpaceState & {
    space: MapSpace;
    company: MapCompany | undefined;
    ppu: number;
    lod: 0 | 1 | 2;
    /** Furniture boxes the label plate should avoid. */
    obstacles: Bounds[];
    /** Numbered workstations in this office. */
    seatCount: number;
    interactive: boolean;
  };

/** Rough rendered width of a line of text, in pixels (SVG text can't be measured on the server). */
const textWidth = (text: string, px: number, tracking = 0) => text.length * px * (0.56 + tracking);

type PlateLine =
  | { kind: "code"; text: string }
  | { kind: "title"; text: string; px: number }
  | { kind: "sub"; text: string }
  | { kind: "status"; text: string; status: keyof typeof availabilityFill; strong?: boolean };

/**
 * Layer 5: the label plate, the click/focus target and the selection outline.
 * The plate is a small card centred in the room, sized in screen pixels so it
 * reads the same at every zoom and never collides with the furniture beneath
 * it more than it has to; how much it says depends on the detail level.
 */
function SpaceOverlay({
  space,
  company,
  selected,
  hovered,
  dimmed,
  ppu,
  lod,
  obstacles,
  seatCount,
  interactive,
  onSelect,
  onHover,
  onFocusSpace,
}: SpaceOverlayProps) {
  const b = shapeBounds(space.shape);
  const unit = 1 / ppu;
  const isOffice = space.kind === "office";
  const vacant = isOffice && !company;
  const status = company?.availability?.status ?? "unknown";

  const lines: PlateLine[] = [];
  if (lod === 0) {
    // Overview: one compact line per room.
    if (isOffice && company) lines.push({ kind: "status", text: company.name, status, strong: true });
    else if (vacant) lines.push({ kind: "sub", text: `${space.code} · Vacant` });
    else lines.push({ kind: "title", text: space.label, px: 11 });
  } else {
    lines.push({ kind: "code", text: space.code });
    if (isOffice && company) {
      lines.push({ kind: "title", text: company.name, px: lod === 1 ? 13.5 : 15 });
      if (lod === 2 && company.industry) lines.push({ kind: "sub", text: company.industry.name });
      lines.push({
        kind: "status",
        text: status === "unknown" ? "Unknown" : availabilityLabel[status],
        status,
      });
      // Members without a desk on the plan (more team than seats).
      const unseated = seatCount ? company.team.length - seatCount : 0;
      if (lod === 2 && unseated > 0) lines.push({ kind: "sub", text: `+${unseated} more in the team` });
    } else if (vacant) {
      lines.push({ kind: "sub", text: "Available office" });
    } else {
      lines.push({ kind: "title", text: space.label, px: 13 });
      if (space.capacity) lines.push({ kind: "sub", text: `Seats ${space.capacity}` });
    }
  }

  // Plate layout in screen pixels.
  const padX = lod === 0 ? 5 : 8;
  const padY = lod === 0 ? 2 : 6;
  const roomPx = b.width * ppu;
  const maxPlate = Math.max(40, Math.min(240, roomPx - 16));
  const maxText = maxPlate - padX * 2;
  const statusIndent = 15;
  const sized = lines.map((l) => {
    const px = l.kind === "code" ? 10 : l.kind === "title" ? l.px : 11;
    const tracking = l.kind === "code" ? 0.1 : 0;
    const indent = l.kind === "status" ? statusIndent : 0;
    const text = fitLabel(l.text, (maxText - indent) / (1 + tracking / 0.56), px);
    const chip = l.kind === "status" && !l.strong;
    const height = l.kind === "code" ? 14 : l.kind === "title" ? px * 1.3 : chip ? 19 : 15;
    const width = textWidth(text, px, tracking) + indent + (chip ? 6 : 0);
    return { ...l, px, tracking, indent, text, height, width, chip };
  });
  const plateW = Math.min(maxPlate, Math.max(...sized.map((l) => l.width)) + padX * 2);
  const plateH = sized.reduce((sum, l) => sum + l.height, 0) + padY * 2;
  const { x: left, y: top } = placeLabel(
    b,
    { width: plateW * unit, height: plateH * unit },
    obstacles,
    6 * unit,
  );

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(space);
    }
  }

  let y = top + padY * unit;
  return (
    <g
      data-space-code={space.code}
      data-nav-id={interactive ? navId.space(space) : undefined}
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
        strokeWidth={selected ? 2.5 : 1.5}
        style={NON_SCALING}
      />
      {/* Keyboard focus ring, shown only for :focus-visible */}
      <g className="focus-ring invisible">
        <ShapeElement
          shape={space.shape}
          className="fill-none stroke-brand-500"
          strokeWidth={3}
          style={NON_SCALING}
          dashed
        />
      </g>

      <g className="pointer-events-none" data-label-plate="">
        <rect
          x={left}
          y={top}
          width={plateW * unit}
          height={plateH * unit}
          rx={4 * unit}
          className={cn("fill-surface/95", selected ? "stroke-brand-500" : "stroke-plate-border")}
          strokeWidth={selected ? 1.5 : 0.8}
          style={NON_SCALING}
        />
        {sized.map((l, i) => {
          const lineTop = y;
          y += l.height * unit;
          const tx = left + (padX + l.indent) * unit;
          const ty = lineTop + (l.height / 2) * unit;
          return (
            <g key={i}>
              {l.kind === "status" && l.chip && (
                <rect
                  x={left + (padX - 1) * unit}
                  y={ty - 8 * unit}
                  width={Math.min(l.width, maxText + 2) * unit}
                  height={16 * unit}
                  rx={8 * unit}
                  className={availabilityChip[l.status]}
                  data-status-chip={l.status}
                />
              )}
              {l.kind === "status" && (
                <circle
                  cx={left + (padX + 6) * unit}
                  cy={ty}
                  r={3.5 * unit}
                  className={availabilityFill[l.status]}
                />
              )}
              <text
                x={tx}
                y={ty}
                dominantBaseline="central"
                fontSize={l.px * unit}
                letterSpacing={l.tracking ? l.px * l.tracking * unit : undefined}
                className={cn(
                  l.kind === "code" && "fill-muted font-mono font-medium",
                  (l.kind === "title" || (l.kind === "status" && l.strong)) && "fill-ink font-semibold",
                  (l.kind === "sub" || (l.kind === "status" && !l.strong)) &&
                    (vacant ? "fill-muted" : "fill-ink/75"),
                )}
              >
                {l.text}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
}
