import type { FloorFixture, FloorGeometry } from "../geometry";
import type { FloorPlan, MapCompany } from "../queries";

/**
 * Sample data for the admin renderer preview (/admin/floor/preview) and for
 * renderer tests. It is never written to the database and never shown to
 * visitors. Room positions match Floor 1 so it also previews the Phase 4R.2
 * redesign direction.
 */

/** A grid of desks (with chairs behind them) inside a box. */
function deskGrid(x: number, y: number, cols: number, rows: number, gapX = 110, gapY = 100): FloorFixture[] {
  const out: FloorFixture[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = x + c * gapX;
      const dy = y + r * gapY;
      out.push({ kind: "desk", x: dx, y: dy, width: 80, height: 46, rotation: 0 });
      out.push({ kind: "chair", x: dx + 26, y: dy + 46, width: 28, height: 28, rotation: 0 });
    }
  }
  return out;
}

const fixtures: FloorFixture[] = [
  // Offices: two rows of three desks each, plus a plant and a shelf.
  ...[40, 420, 800].flatMap((ox) => [
    ...deskGrid(ox + 30, 90, 3, 2),
    { kind: "plant", x: ox + 320, y: 52, width: 28, height: 28, rotation: 0 } as const,
    { kind: "bookshelf", x: ox + 20, y: 48, width: 120, height: 22, rotation: 0 } as const,
  ]),
  ...deskGrid(70, 530, 3, 2),
  { kind: "plant", x: 360, y: 722, width: 28, height: 28, rotation: 0 },
  // Boardroom
  { kind: "meeting_table", x: 450, y: 560, width: 180, height: 100, rotation: 0 },
  { kind: "tv_screen", x: 480, y: 735, width: 120, height: 10, rotation: 0 },
  { kind: "whiteboard", x: 428, y: 560, width: 100, height: 10, rotation: 90 },
  // Lounge
  { kind: "rug", x: 700, y: 500, width: 200, height: 96, rotation: 0 },
  { kind: "sofa", x: 715, y: 506, width: 120, height: 40, rotation: 0 },
  { kind: "armchair", x: 850, y: 540, width: 40, height: 40, rotation: 270 },
  { kind: "coffee_table", x: 745, y: 552, width: 70, height: 34, rotation: 0 },
  { kind: "plant", x: 884, y: 494, width: 26, height: 26, rotation: 0 },
  // Pantry
  { kind: "kitchen_counter", x: 690, y: 718, width: 160, height: 34, rotation: 0 },
  { kind: "sink", x: 720, y: 720, width: 36, height: 28, rotation: 0 },
  { kind: "coffee_machine", x: 790, y: 720, width: 28, height: 28, rotation: 0 },
  { kind: "fridge", x: 870, y: 714, width: 40, height: 40, rotation: 0 },
  { kind: "round_table", x: 740, y: 640, width: 72, height: 72, rotation: 0 },
  // Reception
  { kind: "reception_desk", x: 975, y: 520, width: 150, height: 56, rotation: 0 },
  { kind: "armchair", x: 960, y: 640, width: 40, height: 40, rotation: 0 },
  { kind: "armchair", x: 1010, y: 640, width: 40, height: 40, rotation: 0 },
  { kind: "plant", x: 1120, y: 700, width: 30, height: 30, rotation: 0 },
  { kind: "water_cooler", x: 1125, y: 640, width: 24, height: 24, rotation: 0 },
  // Corridor
  { kind: "plant", x: 50, y: 400, width: 26, height: 26, rotation: 0 },
  { kind: "printer", x: 1100, y: 350, width: 48, height: 32, rotation: 0 },
];

const roomOutline = (x: number, y: number, w: number, h: number): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

export const demoGeometry: FloorGeometry = {
  walls: [
    {
      points: [
        [20, 20],
        [1180, 20],
        [1180, 780],
        [20, 780],
      ],
      closed: true,
      kind: "exterior",
      thickness: 10,
    },
    // Office partitions (doors are cut into these below).
    ...[
      [40, 40, 360, 280],
      [420, 40, 360, 280],
      [800, 40, 360, 280],
      [40, 480, 360, 280],
    ].map(([x, y, w, h]) => ({ points: roomOutline(x, y, w, h), closed: true, kind: "interior" as const })),
    { points: roomOutline(420, 480, 240, 280), closed: true, kind: "glass" },
    {
      points: [
        [940, 480],
        [940, 760],
      ],
      closed: false,
      kind: "interior",
    },
  ],
  areas: [
    {
      key: "corridor",
      kind: "corridor",
      label: "Corridor",
      shape: { type: "rect", x: 40, y: 340, width: 1120, height: 120 },
    },
    {
      key: "lounge",
      kind: "lounge",
      label: "Lounge",
      shape: { type: "rect", x: 680, y: 480, width: 240, height: 130 },
      info: { description: "Informal seating for quick chats.", amenities: ["Sofa", "Wi-Fi"] },
    },
    {
      key: "pantry",
      kind: "pantry",
      label: "Pantry",
      shape: { type: "rect", x: 680, y: 630, width: 240, height: 130 },
      info: { description: "Coffee, tea and a fridge.", amenities: ["Coffee machine", "Fridge"] },
    },
  ],
  entrances: [{ key: "main", label: "Main Entrance", x: 1010, y: 780, width: 80, orientation: "horizontal" }],
  doors: [
    { x: 180, y: 320, width: 50, orientation: "horizontal", swing: -1, hinge: "start", kind: "single" },
    { x: 560, y: 320, width: 50, orientation: "horizontal", swing: -1, hinge: "start", kind: "single" },
    { x: 940, y: 320, width: 50, orientation: "horizontal", swing: -1, hinge: "end", kind: "single" },
    { x: 180, y: 480, width: 50, orientation: "horizontal", swing: 1, hinge: "start", kind: "single" },
    { x: 500, y: 480, width: 80, orientation: "horizontal", swing: 1, hinge: "start", kind: "double" },
    { x: 940, y: 560, width: 60, orientation: "vertical", swing: -1, hinge: "start", kind: "sliding" },
  ],
  windows: [
    { x: 80, y: 20, length: 280, orientation: "horizontal" },
    { x: 460, y: 20, length: 280, orientation: "horizontal" },
    { x: 840, y: 20, length: 280, orientation: "horizontal" },
    { x: 80, y: 780, length: 280, orientation: "horizontal" },
    { x: 460, y: 780, length: 160, orientation: "horizontal" },
    { x: 20, y: 80, length: 200, orientation: "vertical" },
    { x: 20, y: 520, length: 200, orientation: "vertical" },
    { x: 1180, y: 80, length: 200, orientation: "vertical" },
  ],
  fixtures,
};

const sampleCompany = (
  id: string,
  name: string,
  spaceId: string,
  status: "available" | "busy",
  industry: string,
): MapCompany => ({
  id,
  slug: `sample-${id}`,
  name,
  tagline: "Sample company for the renderer preview",
  description: null,
  logo_path: null,
  business_email: "sample@example.dev",
  phone: null,
  website: null,
  space_id: spaceId,
  industry: { slug: "sample", name: industry },
  availability: { status, note: null, updated_at: "2026-10-14T05:00:00.000Z" },
  team: [],
});

export const demoFloorPlan: FloorPlan = {
  building: { name: "Sample building", timezone: "Asia/Kolkata" },
  floors: [{ id: "demo-floor", slug: "demo", name: "Sample floor", level: 1 }],
  floor: { id: "demo-floor", slug: "demo", name: "Sample floor", level: 1 },
  layout: { width: 1200, height: 800, geometry: demoGeometry },
  spaces: [
    {
      id: "s101",
      code: "101",
      kind: "office",
      label: "Office 101",
      capacity: 12,
      shape: { type: "rect", x: 40, y: 40, width: 360, height: 280 },
    },
    {
      id: "s102",
      code: "102",
      kind: "office",
      label: "Office 102",
      capacity: 12,
      shape: { type: "rect", x: 420, y: 40, width: 360, height: 280 },
    },
    {
      id: "s103",
      code: "103",
      kind: "office",
      label: "Office 103",
      capacity: 12,
      shape: { type: "rect", x: 800, y: 40, width: 360, height: 280 },
    },
    {
      id: "s104",
      code: "104",
      kind: "office",
      label: "Office 104",
      capacity: 12,
      shape: { type: "rect", x: 40, y: 480, width: 360, height: 280 },
    },
    {
      id: "sbr1",
      code: "BR-1",
      kind: "meeting_room",
      label: "Boardroom",
      capacity: 10,
      shape: { type: "rect", x: 420, y: 480, width: 240, height: 280 },
    },
    {
      id: "srec",
      code: "REC",
      kind: "reception",
      label: "Reception",
      capacity: null,
      shape: { type: "rect", x: 940, y: 480, width: 220, height: 280 },
    },
  ],
  companies: [
    sampleCompany("c1", "Sample Robotics", "s101", "available", "Deep Tech & Hardware"),
    sampleCompany("c2", "Sample Labs", "s102", "busy", "SaaS"),
  ],
  industries: [],
};
