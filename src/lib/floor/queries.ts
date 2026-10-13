import "server-only";
import type { AvailabilityStatus } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { floorGeometrySchema, shapeSchema, type FloorGeometry, type Shape } from "./geometry";

/**
 * Everything the floor map needs, loaded in one round of queries and checked
 * against the geometry schemas. Runs as the current user, so RLS limits the
 * companies to approved ones (plus nothing private).
 */

export type FloorSummary = { id: string; slug: string; name: string; level: number };

export type MapSpace = {
  id: string;
  code: string;
  kind: Enums<"space_kind">;
  label: string;
  capacity: number | null;
  shape: Shape;
};

export type MapCompany = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_path: string | null;
  business_email: string;
  phone: string | null;
  website: string | null;
  space_id: string | null;
  industry: { slug: string; name: string } | null;
  availability: { status: AvailabilityStatus; note: string | null; updated_at: string } | null;
  team: Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    sort_order: number;
    availability: { status: AvailabilityStatus; updated_at: string } | null;
  }>;
};

export type FloorPlan = {
  building: { name: string; timezone: string } | null;
  floors: FloorSummary[];
  floor: FloorSummary;
  layout: { width: number; height: number; geometry: FloorGeometry };
  spaces: MapSpace[];
  companies: MapCompany[];
  industries: Array<{ slug: string; name: string }>;
};

export type FloorPlanResult =
  { status: "ok"; plan: FloorPlan } | { status: "no-floor" } | { status: "invalid"; problems: string[] };

const companyColumns =
  "id, slug, name, tagline, description, logo_path, business_email, phone, website, space_id, " +
  "industry:industries(slug, name), " +
  "availability:company_availability(status, note, updated_at), " +
  "team:company_team_members(id, full_name, job_title, sort_order, availability:member_availability(status, updated_at))";

/** Loads a floor by slug, or the lowest active floor when no slug is given or it doesn't exist. */
export async function getFloorPlan(floorSlug?: string): Promise<FloorPlanResult> {
  const supabase = await createClient();

  const { data: floors, error: floorsError } = await supabase
    .from("floors")
    .select("id, slug, name, level, building:buildings(name, timezone)")
    .eq("is_active", true)
    .order("level");
  if (floorsError) throw floorsError;
  if (!floors?.length) return { status: "no-floor" };

  const floor = floors.find((f) => f.slug === floorSlug) ?? floors[0];

  const [layoutRes, spacesRes, companiesRes, industriesRes] = await Promise.all([
    supabase.from("floor_layouts").select("width, height, geometry").eq("floor_id", floor.id).maybeSingle(),
    supabase
      .from("floor_spaces")
      .select("id, code, kind, label, capacity, shape")
      .eq("floor_id", floor.id)
      .order("sort_order"),
    supabase
      .from("companies")
      .select(companyColumns)
      .eq("floor_id", floor.id)
      .eq("status", "approved")
      .not("space_id", "is", null)
      .eq("team.is_public", true) // never show hidden members, even to their own company
      .order("sort_order", { referencedTable: "team" })
      .overrideTypes<MapCompany[], { merge: false }>(),
    supabase.from("industries").select("slug, name").order("name"),
  ]);
  for (const res of [layoutRes, spacesRes, companiesRes, industriesRes]) {
    if (res.error) throw res.error;
  }
  if (!layoutRes.data) return { status: "invalid", problems: [`${floor.name} has no layout.`] };

  const problems: string[] = [];
  const geometry = floorGeometrySchema.safeParse(layoutRes.data.geometry);
  if (!geometry.success) problems.push(`Layout geometry: ${geometry.error.issues[0]?.message}`);

  const spaces: MapSpace[] = [];
  for (const space of spacesRes.data ?? []) {
    const shape = shapeSchema.safeParse(space.shape);
    if (shape.success) spaces.push({ ...space, shape: shape.data });
    else problems.push(`Space ${space.code}: ${shape.error.issues[0]?.message}`);
  }
  if (problems.length || !geometry.success) return { status: "invalid", problems };

  return {
    status: "ok",
    plan: {
      building: floor.building,
      floors: floors.map(({ id, slug, name, level }) => ({ id, slug, name, level })),
      floor: { id: floor.id, slug: floor.slug, name: floor.name, level: floor.level },
      layout: { width: layoutRes.data.width, height: layoutRes.data.height, geometry: geometry.data },
      spaces,
      companies: companiesRes.data ?? [],
      industries: industriesRes.data ?? [],
    },
  };
}
