import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatDocument } from "./layout-document";
import type { MapCompany, MapSpace } from "./queries";

/**
 * Data for the layout editor (/admin/floor/editor). Loaded directly rather than
 * through getFloorPlan, which refuses invalid layouts: the editor must be able
 * to open a broken layout to fix it. Admin-only via RLS.
 */

export type LayoutVersion = {
  id: string;
  note: string | null;
  created_at: string;
  author: string | null;
  text: string;
};

export type LayoutEditorData = {
  floor: { id: string; slug: string; name: string };
  floors: Array<{ slug: string; name: string }>;
  text: string;
  updatedAt: string;
  /** Spaces without shapes; the shapes come from the document being edited. */
  spaces: Array<Omit<MapSpace, "shape">>;
  companies: MapCompany[];
  versions: LayoutVersion[];
};

export async function getLayoutEditorData(floorSlug?: string): Promise<LayoutEditorData | null> {
  const supabase = await createClient();
  const { data: floors, error: floorsError } = await supabase
    .from("floors")
    .select("id, slug, name")
    .order("level");
  if (floorsError) throw floorsError;
  const floor = floors.find((f) => f.slug === floorSlug) ?? floors[0];
  if (!floor) return null;

  const [docRes, layoutRes, spacesRes, companiesRes, versionsRes] = await Promise.all([
    supabase.rpc("floor_layout_document", { p_floor_id: floor.id }),
    supabase.from("floor_layouts").select("updated_at").eq("floor_id", floor.id).maybeSingle(),
    supabase
      .from("floor_spaces")
      .select("id, code, kind, label, capacity")
      .eq("floor_id", floor.id)
      .order("sort_order"),
    supabase
      .from("companies")
      .select(
        "id, slug, name, tagline, description, logo_path, business_email, phone, website, space_id, stage, team_size, tech_stack, " +
          "industry:industries(slug, name), availability:company_availability(status, note, updated_at), " +
          "team:company_team_members(id, full_name, job_title, sort_order, availability:member_availability(status, updated_at))",
      )
      .eq("floor_id", floor.id)
      .not("space_id", "is", null)
      .eq("team.is_public", true)
      .order("sort_order", { referencedTable: "team" })
      .overrideTypes<MapCompany[], { merge: false }>(),
    supabase
      .from("floor_layout_versions")
      .select("id, note, created_at, document, author:profiles(full_name)")
      .eq("floor_id", floor.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  for (const res of [docRes, layoutRes, spacesRes, companiesRes, versionsRes]) {
    if (res.error) throw res.error;
  }
  if (!docRes.data || !layoutRes.data) return null;

  return {
    floor,
    floors: floors.map(({ slug, name }) => ({ slug, name })),
    text: formatDocument(docRes.data),
    updatedAt: layoutRes.data.updated_at,
    spaces: spacesRes.data ?? [],
    companies: companiesRes.data ?? [],
    versions: (versionsRes.data ?? []).map((v) => ({
      id: v.id,
      note: v.note,
      created_at: v.created_at,
      author: (v.author as { full_name: string | null } | null)?.full_name ?? null,
      text: formatDocument(v.document),
    })),
  };
}
