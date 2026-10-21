import "server-only";
import type { AvailabilityStatus, StartupStage } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { floorGeometrySchema, shapeSchema, type FloorGeometry, type Shape } from "./geometry";

/**
 * Everything the floor map needs, loaded in one round of queries and checked
 * against the geometry schemas. Runs as the current user, so RLS limits the
 * companies to approved ones (plus nothing private).
 */

export type FloorSummary = {
  id: string;
  slug: string;
  name: string;
  level: number;
  tagline: string | null;
  description: string | null;
};

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
  stage: StartupStage | null;
  team_size: number | null;
  tech_stack: string[];
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
  building: { name: string; timezone: string; address: string | null } | null;
  floors: FloorSummary[];
  floor: FloorSummary;
  layout: { width: number; height: number; geometry: FloorGeometry };
  spaces: MapSpace[];
  companies: MapCompany[];
  industries: Array<{ slug: string; name: string }>;
  /** The FITT Incubation Team (public members), shown at reception. */
  staff: IncubatorStaff[];
  /** Announcements running now, for this floor or every floor. */
  announcements: Announcement[];
};

export type IncubatorStaff = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  availability: { status: AvailabilityStatus; updated_at: string } | null;
};

export type Announcement = {
  id: string;
  floor_id: string | null;
  title: string;
  body: string | null;
  starts_at: string;
  ends_at: string | null;
};

export type FloorPlanResult =
  { status: "ok"; plan: FloorPlan } | { status: "no-floor" } | { status: "invalid"; problems: string[] };

const companyColumns =
  "id, slug, name, tagline, description, logo_path, business_email, phone, website, space_id, stage, team_size, tech_stack, " +
  "industry:industries(slug, name), " +
  "availability:company_availability(status, note, updated_at), " +
  "team:company_team_members(id, full_name, job_title, sort_order, availability:member_availability(status, updated_at))";

/**
 * Loads a floor by slug, or the lowest active floor when no slug is given or it doesn't exist.
 * `includeInactive` is for the admin tools: a floor hidden from visitors must stay editable, or
 * switching it off would lock the admin out of switching it back on. (RLS only returns inactive
 * floors to super admins anyway.)
 */
export async function getFloorPlan(
  floorSlug?: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<FloorPlanResult> {
  const supabase = await createClient();

  let floorsQuery = supabase
    .from("floors")
    .select(
      "id, slug, name, level, tagline, description, building_id, building:buildings(name, timezone, address)",
    )
    .order("level");
  if (!includeInactive) floorsQuery = floorsQuery.eq("is_active", true);
  const { data: floors, error: floorsError } = await floorsQuery;
  if (floorsError) throw floorsError;
  if (!floors?.length) return { status: "no-floor" };

  const floor = floors.find((f) => f.slug === floorSlug) ?? floors[0];

  // Announcements are filtered by time here as well as by RLS, because RLS
  // also lets an admin read scheduled and finished ones.
  const now = new Date().toISOString();
  const [layoutRes, spacesRes, companiesRes, industriesRes, staffRes, announcementsRes] = await Promise.all([
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
    supabase
      .from("incubator_staff")
      .select("id, full_name, job_title, email, phone, availability, availability_updated_at")
      .eq("building_id", floor.building_id)
      .eq("is_public", true)
      .order("sort_order")
      .order("full_name"),
    supabase
      .from("announcements")
      .select("id, floor_id, title, body, starts_at, ends_at")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("starts_at", { ascending: false }),
  ]);
  for (const res of [layoutRes, spacesRes, companiesRes, industriesRes, staffRes, announcementsRes]) {
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
      floors: floors.map(({ id, slug, name, level, tagline, description }) => ({
        id,
        slug,
        name,
        level,
        tagline,
        description,
      })),
      floor: {
        id: floor.id,
        slug: floor.slug,
        name: floor.name,
        level: floor.level,
        tagline: floor.tagline,
        description: floor.description,
      },
      layout: { width: layoutRes.data.width, height: layoutRes.data.height, geometry: geometry.data },
      spaces,
      companies: companiesRes.data ?? [],
      industries: industriesRes.data ?? [],
      staff: (staffRes.data ?? []).map(({ availability, availability_updated_at, ...member }) => ({
        ...member,
        availability:
          availability && availability_updated_at
            ? { status: availability, updated_at: availability_updated_at }
            : null,
      })),
      // Only announcements for floors that are on show (or for every floor).
      announcements: (announcementsRes.data ?? []).filter(
        (a) => a.floor_id === null || floors.some((f) => f.id === a.floor_id),
      ),
    },
  };
}
