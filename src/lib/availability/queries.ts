import "server-only";
import type { AvailabilityStatus } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";

export type OwnTeamMember = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  bio: string | null;
  is_public: boolean;
  is_bookable: boolean;
  sort_order: number;
  availability: { status: AvailabilityStatus; updated_at: string } | null;
};

/** The company's full team (including members hidden from the public), in display order. */
export async function getOwnTeam(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_team_members")
    .select(
      "id, full_name, job_title, email, bio, is_public, is_bookable, sort_order, availability:member_availability(status, updated_at)",
    )
    .eq("company_id", companyId)
    .order("sort_order")
    .order("created_at")
    .overrideTypes<OwnTeamMember[], { merge: false }>();
  if (error) throw error;
  return data;
}

export async function getCompanyAvailability(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_availability")
    .select("status, note, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
