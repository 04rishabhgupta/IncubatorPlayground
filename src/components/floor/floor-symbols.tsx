import type { CSSProperties, ReactNode } from "react";
import { fixtureKindSchema, type FixtureKind } from "@/lib/floor/geometry";

/**
 * Furniture library for the floor plan.
 *
 * Each piece is drawn for the exact box it is given (width × height in floor
 * units, front edge at the top), instead of stretching a fixed symbol: a long
 * meeting table gets more chairs, not oval ones, and round things stay round.
 * Line work uses `non-scaling-stroke`, so outlines stay hairline-thin at every
 * zoom level, like an architectural drawing. Colours are theme custom
 * properties (globals.css).
 *
 * Elements in a `.fp-detail` group (monitors, keyboards, shelf divisions …)
 * are fine detail, hidden when the map is zoomed out.
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

/** Fill + hairline stroke. Widths are screen pixels (non-scaling). */
const s = (fill: string, stroke: string = c.edge, strokeWidth = 0.8): CSSProperties => ({
  fill,
  stroke,
  strokeWidth,
  vectorEffect: "non-scaling-stroke",
});
const line = (stroke: string = c.edge, strokeWidth = 0.6): CSSProperties => ({
  fill: "none",
  stroke,
  strokeWidth,
  vectorEffect: "non-scaling-stroke",
});

const Detail = ({ children }: { children: ReactNode }) => <g className="fp-detail">{children}</g>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A task chair in a w × h box, facing up (the desk is above it). */
function chairBody(w: number, h: number) {
  const r = Math.min(w, h);
  return (
    <>
      <rect
        x={w * 0.14}
        y={h * 0.04}
        width={w * 0.72}
        height={h * 0.68}
        rx={r * 0.18}
        style={s(c.soft, c.softEdge)}
      />
      <rect
        x={w * 0.1}
        y={h * 0.7}
        width={w * 0.8}
        height={h * 0.24}
        rx={r * 0.1}
        style={s(c.softEdge, c.softEdge)}
      />
      <Detail>
        <rect
          x={w * 0.02}
          y={h * 0.2}
          width={w * 0.1}
          height={h * 0.42}
          rx={r * 0.04}
          style={s(c.soft, c.softEdge, 0.6)}
        />
        <rect
          x={w * 0.88}
          y={h * 0.2}
          width={w * 0.1}
          height={h * 0.42}
          rx={r * 0.04}
          style={s(c.soft, c.softEdge, 0.6)}
        />
      </Detail>
    </>
  );
}

/** A chair centred on (cx, cy), rotated so it faces `rotation` degrees from "up". */
function seatAt(cx: number, cy: number, size: number, rotation: number, key: string | number) {
  return (
    <g
      key={key}
      transform={`translate(${cx - size / 2} ${cy - size / 2}) rotate(${rotation} ${size / 2} ${size / 2})`}
    >
      {chairBody(size, size)}
    </g>
  );
}

/** A desk with its monitor at the back (top) edge and keyboard at the front. */
function deskBody(w: number, h: number, y = 0, monitorAtBottom = false) {
  const mw = Math.min(w * 0.45, 26);
  const mh = clamp(h * 0.08, 1.5, 3);
  const my = monitorAtBottom ? y + h - mh - h * 0.1 : y + h * 0.1;
  const ky = monitorAtBottom ? y + h * 0.22 : y + h * 0.62;
  return (
    <>
      <rect x={0} y={y} width={w} height={h} rx={Math.min(1.5, h * 0.05)} style={s(c.wood)} />
      <Detail>
        <rect x={(w - mw) / 2} y={my} width={mw} height={mh} rx={0.6} style={s(c.screen, c.screen, 0.4)} />
        <rect
          x={(w - w * 0.32) / 2}
          y={ky}
          width={w * 0.32}
          height={h * 0.15}
          rx={0.8}
          style={s(c.white, c.metal, 0.5)}
        />
      </Detail>
    </>
  );
}

function sofaBody(w: number, h: number, cushions?: number) {
  const back = h * 0.3;
  const arm = Math.min(w * 0.14, h * 0.32);
  const seatW = w - arm * 2;
  const n = cushions ?? Math.max(1, Math.round(seatW / (h * 0.85)));
  const gap = 0.8;
  const cw = (seatW - gap * (n - 1)) / n;
  return (
    <>
      <rect x={0} y={0} width={w} height={h} rx={Math.min(4, h * 0.14)} style={s(c.soft, c.softEdge)} />
      <rect
        x={arm}
        y={back}
        width={seatW}
        height={h - back - 1}
        rx={1.5}
        style={s(c.white, c.softEdge, 0.6)}
        opacity={0.75}
      />
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={arm + i * (cw + gap)}
          y={back + 0.5}
          width={cw}
          height={h - back - 2}
          rx={2}
          style={s(c.soft, c.softEdge, 0.6)}
        />
      ))}
    </>
  );
}

type Draw = (w: number, h: number) => ReactNode;

/** Drawing per kind plus a realistic default size (floor units, 40 per metre). */
export const FIXTURES: Record<FixtureKind, { size: [number, number]; draw: Draw }> = {
  desk: { size: [56, 28], draw: (w, h) => deskBody(w, h) },
  desk_pair: {
    size: [56, 56],
    draw: (w, h) => (
      <>
        {deskBody(w, h / 2, 0, true)}
        {deskBody(w, h / 2, h / 2)}
      </>
    ),
  },
  chair: { size: [22, 22], draw: (w, h) => chairBody(w, h) },
  meeting_table: {
    size: [160, 90],
    draw: (w, h) => {
      const chair = clamp(Math.min(w, h) * 0.24, 12, 20);
      const inset = chair * 0.8;
      const tw = w - inset * 2;
      const th = h - inset * 2;
      const n = Math.max(1, Math.floor(tw / (chair * 1.45)));
      const seats: ReactNode[] = [];
      for (let i = 0; i < n; i++) {
        const cx = inset + (tw * (i + 0.5)) / n;
        seats.push(seatAt(cx, chair / 2, chair, 180, `t${i}`), seatAt(cx, h - chair / 2, chair, 0, `b${i}`));
      }
      if (th >= chair * 1.1) {
        seats.push(seatAt(chair / 2, h / 2, chair, 90, "l"), seatAt(w - chair / 2, h / 2, chair, 270, "r"));
      }
      return (
        <>
          {seats}
          <rect x={inset} y={inset} width={tw} height={th} rx={Math.min(6, th * 0.25)} style={s(c.wood)} />
          <Detail>
            <rect
              x={inset + 4}
              y={inset + 4}
              width={Math.max(0, tw - 8)}
              height={Math.max(0, th - 8)}
              rx={Math.min(4, th * 0.2)}
              style={line(c.edge, 0.4)}
            />
          </Detail>
        </>
      );
    },
  },
  round_table: {
    size: [64, 64],
    draw: (w, h) => {
      const r = Math.min(w, h) / 2;
      const chair = clamp(r * 0.42, 10, 20);
      const tr = r - chair * 0.75;
      const n = clamp(Math.floor((2 * Math.PI * tr) / (chair * 1.5)), 3, 8);
      return (
        <>
          {Array.from({ length: n }, (_, i) => {
            const theta = (2 * Math.PI * i) / n - Math.PI / 2;
            const d = tr + chair * 0.3;
            return seatAt(
              w / 2 + d * Math.cos(theta),
              h / 2 + d * Math.sin(theta),
              chair,
              (theta * 180) / Math.PI - 90,
              i,
            );
          })}
          <circle cx={w / 2} cy={h / 2} r={tr} style={s(c.wood)} />
        </>
      );
    },
  },
  sofa: { size: [80, 32], draw: (w, h) => sofaBody(w, h) },
  armchair: { size: [32, 32], draw: (w, h) => sofaBody(w, h, 1) },
  coffee_table: {
    size: [44, 24],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} rx={Math.min(3, h * 0.15)} style={s(c.wood)} />
        <Detail>
          <rect
            x={2.5}
            y={2.5}
            width={Math.max(0, w - 5)}
            height={Math.max(0, h - 5)}
            rx={1.5}
            style={s(c.glass, c.edge, 0.4)}
          />
        </Detail>
      </>
    ),
  },
  plant: {
    size: [20, 20],
    draw: (w, h) => {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r * 0.62} style={s(c.white, c.edge, 0.6)} />
          {Array.from({ length: 7 }, (_, i) => (
            <ellipse
              key={i}
              cx={cx}
              cy={cy - r * 0.5}
              rx={r * 0.24}
              ry={r * 0.5}
              transform={`rotate(${(i * 360) / 7} ${cx} ${cy})`}
              style={s(c.plant, c.plantDark, 0.6)}
            />
          ))}
          <circle cx={cx} cy={cy} r={r * 0.16} style={s(c.plantDark, c.plantDark, 0)} />
        </>
      );
    },
  },
  kitchen_counter: {
    size: [120, 24],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} style={s(c.white, c.edge)} />
        <Detail>
          <line x1={0} y1={h * 0.86} x2={w} y2={h * 0.86} style={line()} />
        </Detail>
      </>
    ),
  },
  sink: {
    size: [32, 22],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} style={s(c.white, c.edge)} />
        <rect
          x={w * 0.14}
          y={h * 0.26}
          width={w * 0.72}
          height={h * 0.6}
          rx={Math.min(w, h) * 0.14}
          style={s(c.glass, c.edge, 0.6)}
        />
        <Detail>
          <circle cx={w / 2} cy={h * 0.56} r={Math.min(w, h) * 0.05} style={s(c.metal, c.edge, 0.4)} />
          <rect x={w / 2 - 1} y={h * 0.06} width={2} height={h * 0.2} style={s(c.metal, c.edge, 0.4)} />
        </Detail>
      </>
    ),
  },
  fridge: {
    size: [28, 28],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} style={s(c.white, c.edge)} />
        <line x1={0} y1={h * 0.86} x2={w} y2={h * 0.86} style={line()} />
        <Detail>
          <line x1={w * 0.15} y1={h * 0.15} x2={w * 0.85} y2={h * 0.7} style={line(c.edge, 0.4)} />
          <line x1={w * 0.85} y1={h * 0.15} x2={w * 0.15} y2={h * 0.7} style={line(c.edge, 0.4)} />
        </Detail>
      </>
    ),
  },
  coffee_machine: {
    size: [16, 16],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} rx={1.5} style={s(c.screen, c.screen)} />
        <circle cx={w / 2} cy={h * 0.62} r={Math.min(w, h) * 0.2} style={s(c.white, c.metal, 0.5)} />
      </>
    ),
  },
  reception_desk: {
    size: [120, 40],
    draw: (w, h) => {
      // A shallow curved counter: the visitor side (front) is at the bottom.
      const d = Math.min(h * 0.45, 22);
      const top = h * 0.2;
      const outer = `M 0 ${top} Q ${w / 2} ${2 * h - top} ${w} ${top}`;
      const inner = `L ${w - d} ${top} Q ${w / 2} ${2 * (h - d) - top} ${d} ${top} Z`;
      return (
        <>
          <path d={`${outer} ${inner}`} style={s(c.wood)} />
          <Detail>
            <path
              d={`M ${d * 0.45} ${top} Q ${w / 2} ${2 * (h - d * 0.55) - top} ${w - d * 0.45} ${top}`}
              style={line(c.edge, 0.4)}
            />
            {[0.35, 0.65].map((f) => (
              <rect
                key={f}
                x={w * f - 7}
                y={h - d - 3.5}
                width={14}
                height={2.2}
                rx={0.6}
                style={s(c.screen, c.screen, 0.4)}
              />
            ))}
          </Detail>
        </>
      );
    },
  },
  whiteboard: {
    size: [72, 6],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} style={s(c.white, c.edge)} />
        <Detail>
          <line x1={2} y1={h * 0.7} x2={w - 2} y2={h * 0.7} style={line(c.edge, 0.4)} />
        </Detail>
      </>
    ),
  },
  tv_screen: {
    size: [64, 5],
    draw: (w, h) => <rect x={0} y={0} width={w} height={h} rx={0.8} style={s(c.screen, c.screen)} />,
  },
  printer: {
    size: [32, 24],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} rx={1.5} style={s(c.metal, c.edge)} />
        <Detail>
          <rect x={w * 0.2} y={h * 0.12} width={w * 0.6} height={h * 0.3} style={s(c.white, c.edge, 0.4)} />
          <rect
            x={w * 0.68}
            y={h * 0.62}
            width={w * 0.18}
            height={h * 0.14}
            rx={0.5}
            style={s(c.screen, c.screen, 0.3)}
          />
        </Detail>
      </>
    ),
  },
  bookshelf: {
    size: [72, 16],
    draw: (w, h) => {
      const n = Math.max(1, Math.round(w / 24));
      return (
        <>
          <rect x={0} y={0} width={w} height={h} style={s(c.wood)} />
          <Detail>
            <line x1={0} y1={h * 0.2} x2={w} y2={h * 0.2} style={line(c.edge, 0.4)} />
            {Array.from({ length: n - 1 }, (_, i) => (
              <line
                key={i}
                x1={(w * (i + 1)) / n}
                y1={0}
                x2={(w * (i + 1)) / n}
                y2={h}
                style={line(c.edge, 0.4)}
              />
            ))}
          </Detail>
        </>
      );
    },
  },
  lockers: {
    size: [72, 18],
    draw: (w, h) => {
      const n = Math.max(1, Math.round(w / 16));
      return (
        <>
          <rect x={0} y={0} width={w} height={h} style={s(c.metal, c.edge)} />
          {Array.from({ length: n - 1 }, (_, i) => (
            <line
              key={i}
              x1={(w * (i + 1)) / n}
              y1={0}
              x2={(w * (i + 1)) / n}
              y2={h}
              style={line(c.edge, 0.5)}
            />
          ))}
          <Detail>
            {Array.from({ length: n }, (_, i) => (
              <circle key={i} cx={(w * (i + 0.8)) / n} cy={h * 0.7} r={0.7} style={s(c.edge, c.edge, 0)} />
            ))}
          </Detail>
        </>
      );
    },
  },
  phone_booth: {
    size: [44, 44],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} style={s(c.glass, c.edge, 1.2)} />
        <rect x={2} y={2} width={w - 4} height={h - 4} style={line(c.edge, 0.4)} />
        <rect x={w * 0.15} y={2} width={w * 0.7} height={h * 0.22} style={s(c.wood)} />
        <circle cx={w / 2} cy={h * 0.52} r={Math.min(w, h) * 0.13} style={s(c.soft, c.softEdge)} />
      </>
    ),
  },
  toilet: {
    size: [18, 26],
    draw: (w, h) => (
      <>
        <rect x={w * 0.1} y={0} width={w * 0.8} height={h * 0.26} rx={1} style={s(c.white, c.edge)} />
        <ellipse cx={w / 2} cy={h * 0.6} rx={w * 0.4} ry={h * 0.36} style={s(c.white, c.edge)} />
        <Detail>
          <ellipse cx={w / 2} cy={h * 0.62} rx={w * 0.26} ry={h * 0.24} style={line(c.edge, 0.4)} />
        </Detail>
      </>
    ),
  },
  washbasin: {
    size: [22, 18],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} rx={1} style={s(c.white, c.edge)} />
        <ellipse cx={w / 2} cy={h * 0.58} rx={w * 0.34} ry={h * 0.3} style={s(c.glass, c.edge, 0.6)} />
        <Detail>
          <circle cx={w / 2} cy={h * 0.15} r={Math.min(w, h) * 0.06} style={s(c.metal, c.edge, 0.4)} />
        </Detail>
      </>
    ),
  },
  stairs: {
    size: [100, 160],
    draw: (w, h) => {
      const treads = Math.max(3, Math.round(h / 11));
      return (
        <>
          <rect x={0} y={0} width={w} height={h} style={s(c.white, c.edge)} />
          {Array.from({ length: treads - 1 }, (_, i) => (
            <line
              key={i}
              x1={0}
              y1={(h * (i + 1)) / treads}
              x2={w}
              y2={(h * (i + 1)) / treads}
              style={line()}
            />
          ))}
          <path
            d={`M ${w / 2} ${h * 0.92} L ${w / 2} ${h * 0.1} M ${w / 2 - 5} ${h * 0.1 + 8} L ${w / 2} ${h * 0.1} L ${w / 2 + 5} ${h * 0.1 + 8}`}
            style={line(c.edge, 1)}
          />
          <Detail>
            <path d={`M 0 ${h * 0.62} L ${w} ${h * 0.48}`} style={line(c.edge, 0.8)} />
          </Detail>
        </>
      );
    },
  },
  lift: {
    size: [64, 64],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} style={s(c.metal, c.edge)} />
        <path d={`M 0 0 L ${w} ${h} M ${w} 0 L 0 ${h}`} style={line(c.edge, 0.6)} />
        <rect x={w * 0.25} y={h - 3} width={w * 0.5} height={3} style={s(c.screen, c.screen, 0.4)} />
      </>
    ),
  },
  water_cooler: {
    size: [14, 14],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} rx={1.5} style={s(c.white, c.edge)} />
        <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.3} style={s(c.glass, c.edge, 0.5)} />
      </>
    ),
  },
  rug: {
    size: [100, 64],
    draw: (w, h) => (
      <>
        <rect x={0} y={0} width={w} height={h} rx={2} style={s(c.soft, c.softEdge, 0.5)} opacity={0.45} />
        <Detail>
          <rect
            x={4}
            y={4}
            width={Math.max(0, w - 8)}
            height={Math.max(0, h - 8)}
            rx={1.5}
            style={line(c.softEdge, 0.4)}
            opacity={0.7}
          />
        </Detail>
      </>
    ),
  },
};

export const FIXTURE_KINDS = fixtureKindSchema.options;

/** One fixture drawn in its own w × h box (origin top-left). */
export function FixtureShape({ kind, width, height }: { kind: FixtureKind; width: number; height: number }) {
  return <>{FIXTURES[kind].draw(width, height)}</>;
}
