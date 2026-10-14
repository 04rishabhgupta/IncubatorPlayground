import type { CSSProperties, ReactNode } from "react";
import type { FixtureKind } from "@/lib/floor/geometry";

/**
 * Furniture symbol library for the floor plan.
 *
 * Each piece is an SVG <symbol> defined once inside <defs>; fixtures are then
 * stamped out with <use href="#…">. Colours are CSS custom properties from the
 * theme (globals.css), set via inline `style` so they also apply inside the
 * <use> shadow tree. `preserveAspectRatio="none"` stretches rectangular pieces
 * (desks, counters) to any size; "xMidYMid meet" keeps round pieces round.
 */

const c = {
  wood: "var(--color-furniture)",
  edge: "var(--color-furniture-edge)",
  soft: "var(--color-upholstery)",
  softEdge: "var(--color-upholstery-edge)",
  plant: "var(--color-plant)",
  plantDark: "var(--color-plant-dark)",
  white: "var(--color-ceramic)",
  metal: "var(--color-metal)",
  screen: "var(--color-screen)",
  glass: "var(--color-glass)",
} as const;

const s = (fill: string, stroke: string = c.edge, strokeWidth = 1.5): CSSProperties => ({
  fill,
  stroke,
  strokeWidth,
});

type SymbolDef = { viewBox: string; stretch: boolean; body: ReactNode };

const chair = (cx: number, cy: number, r = 7) => (
  <circle cx={cx} cy={cy} r={r} style={s(c.soft, c.softEdge, 1.2)} />
);

export const FIXTURE_SYMBOLS: Record<FixtureKind, SymbolDef> = {
  desk: {
    viewBox: "0 0 100 60",
    stretch: true,
    body: (
      <>
        <rect x="2" y="2" width="96" height="56" rx="4" style={s(c.wood)} />
        <rect x="30" y="8" width="40" height="6" rx="2" style={s(c.screen, c.screen, 0.5)} />
        <rect x="36" y="30" width="28" height="9" rx="2" style={s(c.white, c.metal, 1)} />
      </>
    ),
  },
  desk_pair: {
    viewBox: "0 0 100 120",
    stretch: true,
    body: (
      <>
        <rect x="2" y="2" width="96" height="56" rx="4" style={s(c.wood)} />
        <rect x="2" y="62" width="96" height="56" rx="4" style={s(c.wood)} />
        <rect x="30" y="50" width="40" height="6" rx="2" style={s(c.screen, c.screen, 0.5)} />
        <rect x="30" y="64" width="40" height="6" rx="2" style={s(c.screen, c.screen, 0.5)} />
      </>
    ),
  },
  chair: {
    viewBox: "0 0 40 40",
    stretch: false,
    body: (
      <>
        <path
          d="M8 12 Q20 2 32 12"
          style={{ fill: "none", stroke: c.softEdge, strokeWidth: 4, strokeLinecap: "round" }}
        />
        <circle cx="20" cy="23" r="12" style={s(c.soft, c.softEdge, 1.5)} />
      </>
    ),
  },
  meeting_table: {
    viewBox: "0 0 200 100",
    stretch: true,
    body: (
      <>
        {[40, 80, 120, 160].map((x) => (
          <g key={x}>
            {chair(x, 12)}
            {chair(x, 88)}
          </g>
        ))}
        {chair(12, 50)}
        {chair(188, 50)}
        <rect x="24" y="24" width="152" height="52" rx="10" style={s(c.wood)} />
      </>
    ),
  },
  round_table: {
    viewBox: "0 0 100 100",
    stretch: false,
    body: (
      <>
        {chair(50, 10)}
        {chair(50, 90)}
        {chair(10, 50)}
        {chair(90, 50)}
        <circle cx="50" cy="50" r="28" style={s(c.wood)} />
      </>
    ),
  },
  sofa: {
    viewBox: "0 0 120 50",
    stretch: true,
    body: (
      <>
        <rect x="2" y="2" width="116" height="46" rx="10" style={s(c.soft, c.softEdge)} />
        <rect x="14" y="16" width="92" height="28" rx="6" style={s(c.white, c.softEdge, 1)} opacity={0.55} />
        <line x1="60" y1="16" x2="60" y2="44" style={{ stroke: c.softEdge, strokeWidth: 1 }} />
      </>
    ),
  },
  armchair: {
    viewBox: "0 0 50 50",
    stretch: false,
    body: (
      <>
        <rect x="3" y="3" width="44" height="44" rx="10" style={s(c.soft, c.softEdge)} />
        <rect x="12" y="14" width="26" height="28" rx="6" style={s(c.white, c.softEdge, 1)} opacity={0.55} />
      </>
    ),
  },
  coffee_table: {
    viewBox: "0 0 80 50",
    stretch: true,
    body: <rect x="3" y="3" width="74" height="44" rx="8" style={s(c.wood)} />,
  },
  plant: {
    viewBox: "0 0 40 40",
    stretch: false,
    body: (
      <>
        <circle cx="20" cy="20" r="17" style={s(c.plant, c.plantDark, 1.5)} />
        <circle cx="14" cy="15" r="7" style={s(c.plantDark, c.plantDark, 0)} opacity={0.35} />
        <circle cx="25" cy="24" r="6" style={s(c.plantDark, c.plantDark, 0)} opacity={0.3} />
        <circle cx="20" cy="20" r="4" style={s(c.wood)} />
      </>
    ),
  },
  kitchen_counter: {
    viewBox: "0 0 200 40",
    stretch: true,
    body: (
      <>
        <rect x="1" y="1" width="198" height="38" rx="2" style={s(c.white, c.metal)} />
        <line x1="1" y1="30" x2="199" y2="30" style={{ stroke: c.metal, strokeWidth: 1 }} />
      </>
    ),
  },
  sink: {
    viewBox: "0 0 50 40",
    stretch: false,
    body: (
      <>
        <rect x="2" y="2" width="46" height="36" rx="3" style={s(c.white, c.metal)} />
        <rect x="8" y="8" width="34" height="24" rx="6" style={s(c.glass, c.metal, 1)} />
        <circle cx="25" cy="6" r="2" style={s(c.metal, c.metal, 0)} />
      </>
    ),
  },
  fridge: {
    viewBox: "0 0 40 40",
    stretch: false,
    body: (
      <>
        <rect x="2" y="2" width="36" height="36" rx="3" style={s(c.white, c.metal)} />
        <line x1="2" y1="14" x2="38" y2="14" style={{ stroke: c.metal, strokeWidth: 1 }} />
        <line
          x1="30"
          y1="18"
          x2="30"
          y2="30"
          style={{ stroke: c.metal, strokeWidth: 2, strokeLinecap: "round" }}
        />
      </>
    ),
  },
  coffee_machine: {
    viewBox: "0 0 40 40",
    stretch: false,
    body: (
      <>
        <rect x="6" y="4" width="28" height="32" rx="4" style={s(c.screen, c.screen, 1)} />
        <circle cx="20" cy="24" r="6" style={s(c.white, c.metal, 1)} />
        <rect x="12" y="9" width="16" height="4" rx="1" style={s(c.metal, c.metal, 0)} />
      </>
    ),
  },
  reception_desk: {
    viewBox: "0 0 160 60",
    stretch: true,
    body: (
      <>
        <path
          d="M4 56 L4 22 Q4 4 22 4 L138 4 Q156 4 156 22 L156 56 L130 56 L130 26 L30 26 L30 56 Z"
          style={s(c.wood)}
        />
        <rect x="64" y="8" width="32" height="6" rx="2" style={s(c.screen, c.screen, 0.5)} />
      </>
    ),
  },
  whiteboard: {
    viewBox: "0 0 120 12",
    stretch: true,
    body: <rect x="1" y="1" width="118" height="10" rx="2" style={s(c.white, c.metal, 1.5)} />,
  },
  tv_screen: {
    viewBox: "0 0 120 10",
    stretch: true,
    body: <rect x="1" y="1" width="118" height="8" rx="2" style={s(c.screen, c.screen, 1)} />,
  },
  printer: {
    viewBox: "0 0 60 40",
    stretch: false,
    body: (
      <>
        <rect x="3" y="6" width="54" height="30" rx="4" style={s(c.metal, c.edge, 1.2)} />
        <rect x="14" y="2" width="32" height="10" rx="1" style={s(c.white, c.metal, 1)} />
        <rect x="40" y="20" width="10" height="4" rx="1" style={s(c.screen, c.screen, 0)} />
      </>
    ),
  },
  bookshelf: {
    viewBox: "0 0 120 30",
    stretch: true,
    body: (
      <>
        <rect x="1" y="1" width="118" height="28" rx="2" style={s(c.wood)} />
        {[12, 30, 48, 66, 84, 102].map((x, i) => (
          <rect
            key={x}
            x={x}
            y="6"
            width="12"
            height="18"
            rx="1"
            style={s(i % 2 ? c.soft : c.plant, c.edge, 0.8)}
            opacity={0.8}
          />
        ))}
      </>
    ),
  },
  lockers: {
    viewBox: "0 0 120 30",
    stretch: true,
    body: (
      <>
        <rect x="1" y="1" width="118" height="28" rx="2" style={s(c.metal, c.edge, 1.2)} />
        {[20, 40, 60, 80, 100].map((x) => (
          <line key={x} x1={x} y1="1" x2={x} y2="29" style={{ stroke: c.edge, strokeWidth: 1 }} />
        ))}
      </>
    ),
  },
  phone_booth: {
    viewBox: "0 0 60 60",
    stretch: false,
    body: (
      <>
        <rect x="2" y="2" width="56" height="56" rx="6" style={s(c.glass, c.metal, 2)} />
        <rect x="10" y="10" width="40" height="14" rx="3" style={s(c.wood)} />
        {chair(30, 40, 9)}
      </>
    ),
  },
  toilet: {
    viewBox: "0 0 40 50",
    stretch: false,
    body: (
      <>
        <rect x="6" y="2" width="28" height="12" rx="3" style={s(c.white, c.metal)} />
        <ellipse cx="20" cy="31" rx="13" ry="16" style={s(c.white, c.metal)} />
      </>
    ),
  },
  washbasin: {
    viewBox: "0 0 50 35",
    stretch: false,
    body: (
      <>
        <rect x="2" y="2" width="46" height="31" rx="4" style={s(c.white, c.metal)} />
        <ellipse cx="25" cy="19" rx="15" ry="9" style={s(c.glass, c.metal, 1)} />
      </>
    ),
  },
  stairs: {
    viewBox: "0 0 100 100",
    stretch: true,
    body: (
      <>
        <rect x="1" y="1" width="98" height="98" style={s(c.white, c.edge, 1.5)} />
        {[12, 24, 36, 48, 60, 72, 84].map((y) => (
          <line key={y} x1="1" y1={y} x2="99" y2={y} style={{ stroke: c.edge, strokeWidth: 1 }} />
        ))}
        <path
          d="M50 88 L50 18 M40 30 L50 16 L60 30"
          style={{ fill: "none", stroke: c.edge, strokeWidth: 2.5 }}
        />
      </>
    ),
  },
  lift: {
    viewBox: "0 0 100 100",
    stretch: false,
    body: (
      <>
        <rect x="4" y="4" width="92" height="92" rx="4" style={s(c.metal, c.edge, 2)} />
        <path d="M14 14 L86 86 M86 14 L14 86" style={{ stroke: c.edge, strokeWidth: 1.5 }} />
        <rect x="30" y="90" width="40" height="6" style={s(c.screen, c.screen, 0)} />
      </>
    ),
  },
  water_cooler: {
    viewBox: "0 0 30 30",
    stretch: false,
    body: (
      <>
        <rect x="3" y="3" width="24" height="24" rx="4" style={s(c.white, c.metal)} />
        <circle cx="15" cy="15" r="7" style={s(c.glass, c.metal, 1)} />
      </>
    ),
  },
  rug: {
    viewBox: "0 0 100 60",
    stretch: true,
    body: (
      <>
        <rect x="2" y="2" width="96" height="56" rx="12" style={s(c.soft, c.softEdge, 1)} opacity={0.35} />
        <rect
          x="10"
          y="10"
          width="80"
          height="40"
          rx="8"
          style={{ fill: "none", stroke: c.softEdge, strokeWidth: 1 }}
          opacity={0.5}
        />
      </>
    ),
  },
};

/** id helpers: one <FloorDefs> per map, ids prefixed so two maps can share a page. */
export const symbolId = (prefix: string, kind: FixtureKind) => `${prefix}-fx-${kind}`;
export const floorPatternId = (prefix: string) => `${prefix}-floor-pattern`;
export const shadowFilterId = (prefix: string) => `${prefix}-shadow`;

/** Shared <defs>: furniture symbols, floor texture and the soft shadow. */
export function FloorDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={floorPatternId(prefix)} width="24" height="24" patternUnits="userSpaceOnUse">
        <circle cx="12" cy="12" r="1" style={{ fill: "var(--color-floor-dot)" }} />
      </pattern>
      <filter id={shadowFilterId(prefix)} x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="1.5" dy="2" stdDeviation="1.5" floodColor="#1e293b" floodOpacity="0.14" />
      </filter>
      {(Object.entries(FIXTURE_SYMBOLS) as Array<[FixtureKind, SymbolDef]>).map(([kind, def]) => (
        <symbol
          key={kind}
          id={symbolId(prefix, kind)}
          viewBox={def.viewBox}
          preserveAspectRatio={def.stretch ? "none" : "xMidYMid meet"}
        >
          {def.body}
        </symbol>
      ))}
    </defs>
  );
}
