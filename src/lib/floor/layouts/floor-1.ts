import type { FloorFixture, FloorGeometry, Shape } from "../geometry";

/**
 * Floor 1 of the Incubation Centre as an architectural plan (Phase 4R.2).
 *
 * This module is the source for the drawing stored in the database: the
 * 20261017090000 migration and supabase/seed.sql hold the same JSON, and a
 * unit test keeps them in sync. Room positions follow the original Floor 1
 * (offices 101–103 to the north, corridor, then 104, boardroom, lounge and
 * pantry, reception), resized so neighbouring rooms share 20 cm partitions.
 *
 * Scale: 40 floor units = 1 m. The canvas is 1200 × 800 (30 m × 20 m).
 * Measurements are placeholders until the building's real plan is available.
 */

export const FLOOR_1_SIZE = { width: 1200, height: 800 } as const;

/** Floor units per metre. */
const M = 40;
/** Partition centre lines (thickness 8 = 20 cm). */
const X1 = 412; // 101 | 102 and 104 | boardroom
const X2 = 788; // 102 | 103
const X3 = 670; // boardroom | lounge, pantry
const X4 = 930; // lounge, pantry | reception
const Y1 = 330; // north offices | corridor
const Y2 = 470; // corridor | south rooms
const Y3 = 620; // lounge | pantry
const HALF = 4;

const rect = (x1: number, y1: number, x2: number, y2: number): Shape => ({
  type: "rect",
  x: x1,
  y: y1,
  width: x2 - x1,
  height: y2 - y1,
});

/** Clickable spaces by code. Ids in the database are kept; only shapes change. */
export const FLOOR_1_SPACES: Record<string, Shape> = {
  "101": rect(40, 40, X1 - HALF, Y1 - HALF),
  "102": rect(X1 + HALF, 40, X2 - HALF, Y1 - HALF),
  "103": rect(X2 + HALF, 40, 1160, Y1 - HALF),
  "104": rect(40, Y2 + HALF, X1 - HALF, 760),
  "BR-1": rect(X1 + HALF, Y2 + HALF, X3 - HALF, 760),
  REC: rect(X4 + HALF, Y2 + HALF, 1160, 760),
};

const fx = (
  kind: FloorFixture["kind"],
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: FloorFixture["rotation"] = 0,
  seat?: number,
): FloorFixture => ({ kind, x, y, width, height, rotation, ...(seat ? { seat } : {}) });

const DESK = 1.2 * M; // 1.2 m × 0.7 m desks, back to back
const PAIR_DEPTH = 1.4 * M;
const CHAIR = 0.55 * M;

/**
 * A bench of back-to-back desk pairs with a chair either side. Seats are
 * numbered window side first: `windowRow` seats count from `windowSeat`,
 * the other row from `innerSeat`.
 */
function bench(
  x: number,
  y: number,
  pairs: number,
  windowAtTop: boolean,
  windowSeat: number,
  innerSeat: number,
): FloorFixture[] {
  const out: FloorFixture[] = [];
  for (let i = 0; i < pairs; i++) {
    const dx = x + i * DESK;
    const cx = dx + (DESK - CHAIR) / 2;
    const top = (windowAtTop ? windowSeat : innerSeat) + i;
    const bottom = (windowAtTop ? innerSeat : windowSeat) + i;
    out.push(fx("chair", cx, y, CHAIR, CHAIR, 180, top));
    out.push(fx("desk_pair", dx, y + CHAIR + 2, DESK, PAIR_DEPTH));
    out.push(fx("chair", cx, y + CHAIR + 4 + PAIR_DEPTH, CHAIR, CHAIR, 0, bottom));
  }
  return out;
}

/**
 * A 12-seat office (368 × 286): two benches of six by the windows, a
 * meeting table and storage on the corridor side, and a clear aisle between
 * them for the door swing and the room label.
 */
function office(shape: Shape, windowAtTop: boolean): FloorFixture[] {
  if (shape.type !== "rect") return [];
  const { x, y, height } = shape;
  const benchY = windowAtTop ? y + 16 : y + height - 16 - (CHAIR * 2 + PAIR_DEPTH + 4);
  const zoneY = windowAtTop ? y + 200 : y + 22;
  return [
    ...bench(x + 24, benchY, 3, windowAtTop, 1, 7),
    ...bench(x + 200, benchY, 3, windowAtTop, 4, 10),
    fx("round_table", x + 24, zoneY, 64, 64),
    fx("bookshelf", x + 250, windowAtTop ? y + height - 18 : y + 2, 96, 16, windowAtTop ? 0 : 180),
    fx("plant", x + 330, windowAtTop ? y + 160 : y + 106, 20, 20),
  ];
}

const fixtures: FloorFixture[] = [
  ...office(FLOOR_1_SPACES["101"], true),
  ...office(FLOOR_1_SPACES["102"], true),
  ...office(FLOOR_1_SPACES["103"], true),
  ...office(FLOOR_1_SPACES["104"], false),
  // Boardroom: a 4 m table for 10, screen on the far wall, whiteboard on the side.
  fx("meeting_table", 496, 548, 90, 160, 90),
  fx("tv_screen", 509, 752, 64, 5),
  fx("whiteboard", 418, 584, 6, 72),
  fx("plant", 640, 736, 20, 20),
  // Lounge: open to the corridor.
  fx("rug", 715, 490, 170, 90),
  fx("sofa", 745, 574, 110, 34, 180),
  fx("armchair", 690, 506, 32, 32, 270),
  fx("armchair", 878, 506, 32, 32, 90),
  fx("coffee_table", 770, 516, 60, 30),
  fx("plant", 900, 588, 20, 20),
  // Pantry: counter along the outside wall, a café table in the middle.
  fx("kitchen_counter", 690, 734, 184, 24, 180),
  fx("sink", 716, 735, 32, 22, 180),
  fx("coffee_machine", 790, 738, 16, 16),
  fx("fridge", 890, 730, 28, 28, 180),
  fx("round_table", 770, 650, 60, 60),
  fx("water_cooler", 682, 632, 14, 14),
  // Reception: curved counter facing the entrance, waiting seats by the walls.
  fx("reception_desk", 982, 602, 130, 44),
  fx("chair", 1013, 578, 22, 22, 180),
  fx("chair", 1059, 578, 22, 22, 180),
  fx("sofa", 938, 660, 32, 84, 270),
  fx("armchair", 1124, 664, 32, 32, 90),
  fx("armchair", 1124, 702, 32, 32, 90),
  fx("coffee_table", 1092, 676, 24, 46),
  fx("plant", 1136, 736, 20, 20),
  fx("plant", 940, 480, 20, 20),
  fx("water_cooler", 1140, 482, 14, 14),
  // Corridor
  fx("plant", 48, 342, 20, 20),
  fx("lockers", 650, 338, 96, 18),
  fx("printer", 1120, 340, 32, 24),
];

const seg = (...points: Array<[number, number]>) => points;

export const floor1Geometry: FloorGeometry = {
  walls: [
    {
      points: [
        [28, 28],
        [1172, 28],
        [1172, 772],
        [28, 772],
      ],
      closed: true,
      kind: "exterior",
      thickness: 24,
    },
    ...[
      seg([28, Y1], [1172, Y1]),
      seg([X1, 28], [X1, Y1]),
      seg([X2, 28], [X2, Y1]),
      seg([28, Y2], [X1, Y2]),
      seg([X1, Y2], [X1, 772]),
      seg([X3, Y2], [X3, 772]),
      seg([X4, Y2], [X4, 772]),
      seg([X4, Y2], [1172, Y2]),
      seg([X3, Y3], [X4, Y3]),
    ].map((points) => ({ points, closed: false, kind: "interior" as const, thickness: 8 })),
    { points: seg([X1, Y2], [X3, Y2]), closed: false, kind: "glass", thickness: 8 },
  ],
  areas: [
    {
      key: "corridor",
      kind: "corridor",
      label: "Corridor",
      shape: rect(40, Y1 + HALF, 1160, Y2 - HALF),
    },
    {
      key: "lounge",
      kind: "lounge",
      label: "Lounge",
      shape: rect(X3 + HALF, Y2 + HALF, X4 - HALF, Y3 - HALF),
      info: { description: "Informal seating for quick chats.", amenities: ["Sofa", "Wi-Fi"] },
    },
    {
      key: "pantry",
      kind: "pantry",
      label: "Pantry",
      shape: rect(X3 + HALF, Y3 + HALF, X4 - HALF, 760),
      info: { description: "Coffee, tea and a fridge.", amenities: ["Coffee machine", "Fridge"] },
    },
  ],
  entrances: [{ key: "main", label: "Main Entrance", x: 1010, y: 772, width: 80, orientation: "horizontal" }],
  doors: [
    { x: 210, y: Y1, width: 40, orientation: "horizontal", swing: -1, hinge: "start", kind: "single" },
    { x: 586, y: Y1, width: 40, orientation: "horizontal", swing: -1, hinge: "start", kind: "single" },
    { x: 962, y: Y1, width: 40, orientation: "horizontal", swing: -1, hinge: "start", kind: "single" },
    { x: 210, y: Y2, width: 40, orientation: "horizontal", swing: 1, hinge: "start", kind: "single" },
    { x: 500, y: Y2, width: 72, orientation: "horizontal", swing: 1, hinge: "start", kind: "double" },
    { x: X4, y: 500, width: 60, orientation: "vertical", swing: -1, hinge: "start", kind: "sliding" },
    { x: 990, y: Y2, width: 120, orientation: "horizontal", swing: 1, hinge: "start", kind: "opening" },
    { x: 730, y: Y3, width: 140, orientation: "horizontal", swing: 1, hinge: "start", kind: "opening" },
  ],
  windows: [
    { x: 74, y: 28, length: 300, orientation: "horizontal" },
    { x: 450, y: 28, length: 300, orientation: "horizontal" },
    { x: 826, y: 28, length: 300, orientation: "horizontal" },
    { x: 74, y: 772, length: 300, orientation: "horizontal" },
    { x: 461, y: 772, length: 160, orientation: "horizontal" },
    { x: 710, y: 772, length: 180, orientation: "horizontal" },
    { x: 28, y: 80, length: 200, orientation: "vertical" },
    { x: 28, y: 520, length: 200, orientation: "vertical" },
    { x: 1172, y: 80, length: 200, orientation: "vertical" },
    { x: 1172, y: 540, length: 180, orientation: "vertical" },
  ],
  fixtures,
};
