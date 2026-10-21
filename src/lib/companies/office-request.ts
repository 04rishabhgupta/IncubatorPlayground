import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Office requests (Phase 4R.5): an approved company without an office asks for
 * one vacant office, or any, with a note for the platform admin. One request
 * per company; placing the company fulfils it (database trigger).
 */

export type OwnOfficeRequest = {
  space_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type RequestableOffice = { id: string; label: string; floor: string };

export async function getOwnOfficeRequest(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("office_requests")
    .select("space_id, note, created_at, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data as OwnOfficeRequest | null;
}

/** Offices on active floors that no visible company occupies, in floor order. */
export async function listRequestableOffices(): Promise<RequestableOffice[]> {
  const supabase = await createClient();
  const [spacesRes, takenRes] = await Promise.all([
    supabase
      .from("floor_spaces")
      .select("id, label, sort_order, floor:floors!inner(name, level, is_active)")
      .eq("kind", "office")
      .eq("floor.is_active", true),
    supabase.from("companies").select("space_id").not("space_id", "is", null),
  ]);
  if (spacesRes.error) throw spacesRes.error;
  if (takenRes.error) throw takenRes.error;
  const taken = new Set((takenRes.data ?? []).map((c) => c.space_id));
  return (spacesRes.data ?? [])
    .filter((s) => !taken.has(s.id))
    .sort((a, b) => a.floor.level - b.floor.level || a.sort_order - b.sort_order)
    .map((s) => ({ id: s.id, label: s.label, floor: s.floor.name }));
}
