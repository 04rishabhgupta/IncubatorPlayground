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
export type OfficeRequest = { space_id: string | null; note: string | null; created_at: string };
export type UnplacedCompany = {
  id: string;
  name: string;
  industry: { name: string } | null;
  /** The company's office request, if it sent one. */
  request: OfficeRequest | null;
};

export type AdminFloorSummary = {
  id: string;
  slug: string;
  name: string;
  level: number;
  is_active: boolean;
  tagline: string | null;
  description: string | null;
};

export type AdminFloorData = {
  plan: FloorPlan;
  placed: PlacedCompany[];
  unplaced: UnplacedCompany[];
  allFloors: AdminFloorSummary[];
};

export async function getAdminFloorData(floorSlug?: string) {
  const result = await getFloorPlan(floorSlug, { includeInactive: true });
  if (result.status !== "ok") return result;
  const { plan } = result;

  const supabase = await createClient();
  const [placedRes, unplacedRes, allFloorsRes, requestsRes] = await Promise.all([
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
      .overrideTypes<Array<Omit<UnplacedCompany, "request">>, { merge: false }>(),
    supabase.from("floors").select("id, slug, name, level, is_active, tagline, description").order("level"),
    supabase.from("office_requests").select("company_id, space_id, note, created_at").order("created_at"),
  ]);
  if (placedRes.error) throw placedRes.error;
  if (unplacedRes.error) throw unplacedRes.error;
  if (allFloorsRes.error) throw allFloorsRes.error;
  if (requestsRes.error) throw requestsRes.error;
  const requests = new Map((requestsRes.data ?? []).map(({ company_id, ...r }) => [company_id, r]));

  const data: AdminFloorData = {
    plan,
    placed: (placedRes.data ?? []).map((c) => ({ ...c, team: [] })),
    // Companies that asked for an office first, oldest request first.
    unplaced: (unplacedRes.data ?? [])
      .map((c) => ({ ...c, request: requests.get(c.id) ?? null }))
      .sort((a, b) =>
        a.request && b.request
          ? a.request.created_at.localeCompare(b.request.created_at)
          : Number(Boolean(b.request)) - Number(Boolean(a.request)),
      ),
    allFloors: allFloorsRes.data ?? [],
  };
  return { status: "ok" as const, data };
}
