import "server-only";
import type { CompanyStatus } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";
import { getFloorPlan, type FloorPlan, type MapCompany } from "./queries";

/**
 * Data for the admin placement tool. Unlike the public map it includes
 * companies in any status (a suspended company still holds its office) and
 * the approved companies that don't have an office yet. Admin-only via RLS.
 */
export type PlacedCompany = MapCompany & { status: CompanyStatus };
export type UnplacedCompany = { id: string; name: string; industry: { name: string } | null };

export type AdminFloorData = {
  plan: FloorPlan;
  placed: PlacedCompany[];
  unplaced: UnplacedCompany[];
};

export async function getAdminFloorData(floorSlug?: string) {
  const result = await getFloorPlan(floorSlug);
  if (result.status !== "ok") return result;
  const { plan } = result;

  const supabase = await createClient();
  const [placedRes, unplacedRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, slug, name, status, tagline, description, logo_path, business_email, phone, website, space_id, " +
          "industry:industries(slug, name), availability:company_availability(status, note, updated_at)",
      )
      .eq("floor_id", plan.floor.id)
      .not("space_id", "is", null)
      .overrideTypes<Array<Omit<PlacedCompany, "team">>, { merge: false }>(),
    supabase
      .from("companies")
      .select("id, name, industry:industries(name)")
      .eq("status", "approved")
      .is("space_id", null)
      .order("name")
      .overrideTypes<UnplacedCompany[], { merge: false }>(),
  ]);
  if (placedRes.error) throw placedRes.error;
  if (unplacedRes.error) throw unplacedRes.error;

  const data: AdminFloorData = {
    plan,
    placed: (placedRes.data ?? []).map((c) => ({ ...c, team: [] })),
    unplaced: unplacedRes.data ?? [],
  };
  return { status: "ok" as const, data };
}
