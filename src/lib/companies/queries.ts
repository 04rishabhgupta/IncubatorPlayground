import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

/**
 * Company reads. All queries run as the current user, so RLS decides what is
 * visible: guests and visitors only ever receive approved companies.
 */

export type CompanyStatus = Enums<"company_status">;
export type AvailabilityStatus = Enums<"availability_status">;

const directoryColumns =
  "id, name, slug, tagline, description, logo_path, " +
  "industry:industries(slug, name), " +
  "space:floor_spaces(code, label), " +
  "availability:company_availability(status, updated_at)";

/** Escape LIKE wildcards so user input is matched literally. */
function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listIndustries() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("industries").select("slug, name").order("name");
  if (error) throw error;
  return data;
}

export type DirectoryFilters = { q?: string; industry?: string };

export async function listDirectoryCompanies({ q, industry }: DirectoryFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("companies")
    .select(
      industry
        ? directoryColumns.replace("industries(slug, name)", "industries!inner(slug, name)")
        : directoryColumns,
    )
    .eq("status", "approved")
    .order("name");
  if (q) query = query.ilike("name", likePattern(q));
  if (industry) query = query.eq("industry.slug", industry);

  const { data, error } = await query.overrideTypes<DirectoryCompany[], { merge: false }>();
  if (error) throw error;
  return data;
}

export type DirectoryCompany = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  logo_path: string | null;
  industry: { slug: string; name: string } | null;
  space: { code: string; label: string } | null;
  availability: { status: AvailabilityStatus; updated_at: string } | null;
};

/** Approved company by slug, or the caller's own company in any status. */
export async function getCompanyProfile(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, owner_id, name, slug, tagline, description, services, website, business_email, phone, founded_year, logo_path, status, " +
        "industry:industries(slug, name), " +
        "floor:floors(name, level), space:floor_spaces(code, label), " +
        "availability:company_availability(status, note, updated_at), " +
        "team:company_team_members(id, full_name, job_title, email, sort_order, availability:member_availability(status, updated_at))",
    )
    .eq("slug", slug)
    // Owners/admins may read hidden members under RLS; the public profile never shows them.
    .eq("team.is_public", true)
    .order("sort_order", { referencedTable: "team" })
    .maybeSingle()
    .overrideTypes<CompanyProfile, { merge: false }>();
  if (error) throw error;
  return data;
}

export type CompanyProfile = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  services: string[];
  website: string | null;
  business_email: string;
  phone: string | null;
  founded_year: number | null;
  logo_path: string | null;
  status: CompanyStatus;
  industry: { slug: string; name: string } | null;
  floor: { name: string; level: number } | null;
  space: { code: string; label: string } | null;
  availability: { status: AvailabilityStatus; note: string | null; updated_at: string } | null;
  team: Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    email: string | null;
    sort_order: number;
    availability: { status: AvailabilityStatus; updated_at: string } | null;
  }>;
};

/** The signed-in company account's own company (any status). */
export async function getOwnCompany(ownerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, slug, tagline, description, services, website, business_email, phone, office_details, founded_year, logo_path, status, status_reason, created_at, industry_id, " +
        "industry:industries(slug, name), space:floor_spaces(label)",
    )
    .eq("owner_id", ownerId)
    .maybeSingle()
    .overrideTypes<OwnCompany, { merge: false }>();
  if (error) throw error;
  return data;
}

export type OwnCompany = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  services: string[];
  website: string | null;
  business_email: string;
  phone: string | null;
  office_details: string | null;
  founded_year: number | null;
  logo_path: string | null;
  status: CompanyStatus;
  status_reason: string | null;
  created_at: string;
  industry_id: string | null;
  industry: { slug: string; name: string } | null;
  space: { label: string } | null;
};

// --- Admin --------------------------------------------------------------------------

export async function listCompaniesForAdmin({ status, q }: { status?: CompanyStatus; q?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("companies")
    .select("id, name, slug, business_email, status, created_at, reviewed_at, industry:industries(name)")
    .order("created_at", { ascending: status === "pending" });
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("name", likePattern(q));
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data;
}

export async function countCompaniesByStatus() {
  const supabase = await createClient();
  const statuses: CompanyStatus[] = ["pending", "approved", "rejected", "suspended"];
  const counts = await Promise.all(
    statuses.map((status) =>
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  );
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i].count ?? 0])) as Record<
    CompanyStatus,
    number
  >;
}

export async function getCompanyForAdmin(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, owner_id, name, slug, tagline, description, services, website, business_email, phone, office_details, founded_year, logo_path, status, status_reason, created_at, reviewed_at, " +
        "industry:industries(name), space:floor_spaces(label), " +
        "owner:profiles!companies_owner_id_fkey(full_name, email, phone), " +
        "requests:company_registration_requests(id, status, review_notes, reviewed_at, created_at, submitted_data, " +
        "reviewer:profiles!company_registration_requests_reviewed_by_fkey(full_name, email))",
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "requests", ascending: false })
    .maybeSingle()
    .overrideTypes<AdminCompany, { merge: false }>();
  if (error) throw error;
  return data;
}

export type AdminCompany = OwnCompany & {
  owner_id: string;
  reviewed_at: string | null;
  industry: { name: string } | null;
  owner: { full_name: string; email: string; phone: string | null } | null;
  requests: Array<{
    id: string;
    status: Enums<"registration_status">;
    review_notes: string | null;
    reviewed_at: string | null;
    created_at: string;
    submitted_data: Record<string, unknown>;
    reviewer: { full_name: string; email: string } | null;
  }>;
};
