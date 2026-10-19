import type { FloorGeometry, Shape } from "../geometry";
import { floor1Geometry, FLOOR_1_SIZE, FLOOR_1_SPACES } from "../layouts/floor-1";
import type { AvailabilityStatus } from "@/lib/companies/queries";
import type { FloorPlan, MapCompany } from "../queries";

/**
 * Sample data for the admin renderer preview (/admin/floor/preview) and for
 * renderer tests. It is never written to the database and never shown to
 * visitors.
 */

/** The sample uses the real Floor 1 drawing, so the preview shows exactly what visitors will see. */
export const demoGeometry: FloorGeometry = floor1Geometry;

type TeamMember = MapCompany["team"][number];
const member = (i: number, full_name: string, status: AvailabilityStatus | null): TeamMember => ({
  id: `m${i}`,
  full_name,
  job_title: null,
  sort_order: i,
  availability: status ? { status, updated_at: "2026-10-14T05:00:00.000Z" } : null,
});

const sampleCompany = (
  id: string,
  name: string,
  spaceId: string,
  status: "available" | "busy",
  industry: string,
  team: MapCompany["team"] = [],
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
  team,
});

const space = (code: string): Shape => FLOOR_1_SPACES[code];

export const demoFloorPlan: FloorPlan = {
  building: { name: "Sample building", timezone: "Asia/Kolkata" },
  floors: [{ id: "demo-floor", slug: "demo", name: "Sample floor", level: 1 }],
  floor: { id: "demo-floor", slug: "demo", name: "Sample floor", level: 1 },
  layout: { ...FLOOR_1_SIZE, geometry: demoGeometry },
  spaces: [
    {
      id: "s101",
      code: "101",
      kind: "office",
      label: "Office 101",
      capacity: 12,
      shape: space("101"),
    },
    {
      id: "s102",
      code: "102",
      kind: "office",
      label: "Office 102",
      capacity: 12,
      shape: space("102"),
    },
    {
      id: "s103",
      code: "103",
      kind: "office",
      label: "Office 103",
      capacity: 12,
      shape: space("103"),
    },
    {
      id: "s104",
      code: "104",
      kind: "office",
      label: "Office 104",
      capacity: 12,
      shape: space("104"),
    },
    {
      id: "sbr1",
      code: "BR-1",
      kind: "meeting_room",
      label: "Boardroom",
      capacity: 10,
      shape: space("BR-1"),
    },
    {
      id: "srec",
      code: "REC",
      kind: "reception",
      label: "Reception",
      capacity: null,
      shape: space("REC"),
    },
  ],
  companies: [
    sampleCompany("c1", "Sample Robotics", "s101", "available", "Deep Tech & Hardware", [
      member(1, "Asha Rao", "available"),
      member(2, "Kiran Das", "busy"),
      member(3, "Meera Iyer", "available"),
      member(4, "Rohan Mehta", null),
      member(5, "Sana Qureshi", "unavailable"),
      member(6, "Vikram Singh", "available"),
      member(7, "Lata", "busy"),
    ]),
    sampleCompany("c2", "Sample Labs", "s102", "busy", "SaaS"),
  ],
  industries: [],
};
