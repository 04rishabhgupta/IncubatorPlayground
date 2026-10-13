"use server";

import { ownCompany, revalidateCompany } from "@/lib/companies/owner";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { companyAvailabilitySchema, memberAvailabilitySchema, teamMemberSchema } from "@/lib/validation/team";

/**
 * Availability and team records for the signed-in company account. Every
 * write runs as that user, so RLS confines it to their own company; the
 * database stamps updated_at / updated_by itself.
 */

export async function setCompanyAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error, values };

  const parsed = companyAvailabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const { status, note } = parsed.data;
  const { supabase, company } = ctx;

  const { error } =
    status === "unknown"
      ? await supabase.from("company_availability").delete().eq("company_id", company.id)
      : await supabase
          .from("company_availability")
          .upsert({ company_id: company.id, status, note: note ?? null }, { onConflict: "company_id" });
  if (error) {
    console.error("Company availability update failed", error);
    return { status: "error", message: "Availability couldn't be saved. Please try again.", values };
  }

  revalidateCompany(company.slug);
  return {
    status: "success",
    message: status === "unknown" ? "Availability cleared." : "Availability updated.",
    values,
  };
}

export async function setMemberAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = memberAvailabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Choose a valid status." };
  const { memberId, status } = parsed.data;
  const { supabase, company } = ctx;

  // Confirm the member belongs to this company before writing (RLS would refuse anyway).
  const { data: member } = await supabase
    .from("company_team_members")
    .select("id, full_name")
    .eq("id", memberId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!member) return { status: "error", message: "That team member no longer exists." };

  const { error } =
    status === "unknown"
      ? await supabase.from("member_availability").delete().eq("member_id", memberId)
      : await supabase
          .from("member_availability")
          .upsert({ member_id: memberId, status }, { onConflict: "member_id" });
  if (error) return { status: "error", message: "Availability couldn't be saved. Please try again." };

  revalidateCompany(company.slug);
  return { status: "success", message: `${member.full_name}: availability updated.` };
}

export async function saveTeamMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error, values };

  const parsed = teamMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const input = parsed.data;
  const { supabase, company } = ctx;

  const record = {
    full_name: input.fullName,
    job_title: input.jobTitle ?? null,
    email: input.email ?? null,
    bio: input.bio ?? null,
    is_public: input.isPublic,
    is_bookable: input.isBookable,
  };

  if (input.memberId) {
    const { data, error } = await supabase
      .from("company_team_members")
      .update(record)
      .eq("id", input.memberId)
      .eq("company_id", company.id)
      .select("id")
      .maybeSingle();
    if (error || !data) return { status: "error", message: "The team member couldn't be saved.", values };
  } else {
    const { count } = await supabase
      .from("company_team_members")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id);
    if ((count ?? 0) >= 100)
      return { status: "error", message: "A company can list at most 100 team members." };
    const { error } = await supabase
      .from("company_team_members")
      .insert({ ...record, company_id: company.id, sort_order: count ?? 0 });
    if (error) return { status: "error", message: "The team member couldn't be added.", values };
  }

  revalidateCompany(company.slug);
  return {
    status: "success",
    message: input.memberId ? `${input.fullName} updated.` : `${input.fullName} added to the team.`,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteTeamMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };
  const memberId = String(formData.get("memberId") ?? "");
  if (!UUID.test(memberId)) return { status: "error", message: "Unknown team member." };
  const { supabase, company } = ctx;

  const { data, error } = await supabase
    .from("company_team_members")
    .delete()
    .eq("id", memberId)
    .eq("company_id", company.id)
    .select("full_name")
    .maybeSingle();
  if (error || !data) return { status: "error", message: "The team member couldn't be removed." };

  revalidateCompany(company.slug);
  return { status: "success", message: `${data.full_name} removed from the team.` };
}

/** Swaps a member with its neighbour in the display order. */
export async function moveTeamMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };
  const memberId = String(formData.get("memberId") ?? "");
  if (!UUID.test(memberId)) return { status: "error", message: "Unknown team member." };
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const { supabase, company } = ctx;

  const { data: team } = await supabase
    .from("company_team_members")
    .select("id, sort_order")
    .eq("company_id", company.id)
    .order("sort_order")
    .order("created_at");
  const list = team ?? [];
  const index = list.findIndex((m) => m.id === memberId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return { status: "idle" };

  // Normalise to 0..n-1 with the two entries swapped.
  const ordered = [...list];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const updates = ordered
    .map((m, i) => ({ id: m.id, sort_order: i, changed: m.sort_order !== i }))
    .filter((m) => m.changed);
  for (const u of updates) {
    const { error } = await supabase
      .from("company_team_members")
      .update({ sort_order: u.sort_order })
      .eq("id", u.id)
      .eq("company_id", company.id);
    if (error) return { status: "error", message: "The order couldn't be saved." };
  }

  revalidateCompany(company.slug);
  return { status: "success" };
}
