"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { checkLogoFile } from "@/lib/files";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { companyProfileSchema } from "@/lib/validation/company";

/** Resolve the caller's own company, or explain why not. */
async function ownCompany() {
  const session = await getSession();
  if (!session) return { error: "Your session has expired. Please sign in again." } as const;
  if (session.profile.role !== "company") return { error: "Only company accounts can do this." } as const;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, slug, logo_path, status")
    .eq("owner_id", session.userId)
    .maybeSingle();
  if (!company) return { error: "No company is linked to this account." } as const;
  return { supabase, company } as const;
}

function revalidateCompany(slug: string) {
  revalidatePath("/company", "layout");
  revalidatePath("/directory");
  revalidatePath(`/companies/${slug}`);
}

export async function updateCompanyProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error, values };

  const parsed = companyProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const input = parsed.data;

  const { supabase, company } = ctx;
  const { data: industry } = await supabase
    .from("industries")
    .select("id")
    .eq("slug", input.industry)
    .maybeSingle();
  if (!industry) return { status: "error", fieldErrors: { industry: ["Choose an industry."] }, values };

  const { error } = await supabase
    .from("companies")
    .update({
      name: input.name,
      industry_id: industry.id,
      tagline: input.tagline ?? null,
      description: input.description,
      services: input.services,
      website: input.website ?? null,
      business_email: input.businessEmail,
      phone: input.phone ?? null,
      office_details: input.officeDetails ?? null,
      founded_year: input.foundedYear ? Number(input.foundedYear) : null,
    })
    .eq("id", company.id);
  if (error) {
    console.error("Company profile update failed", error);
    return { status: "error", message: "We couldn't save your changes. Please try again.", values };
  }

  revalidateCompany(company.slug);
  return { status: "success", message: "Company profile saved.", values };
}

export async function uploadCompanyLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", fieldErrors: { logo: ["Choose an image to upload."] } };
  }
  const check = await checkLogoFile(file);
  if (!check.ok) return { status: "error", fieldErrors: { logo: [check.error] } };

  // Runs as the signed-in owner: the storage policy only allows "<own company id>/…".
  const { supabase, company } = ctx;
  const path = `${company.id}/logo-${Date.now()}.${check.ext}`;
  const { error: uploadError } = await supabase.storage
    .from("company-logos")
    .upload(path, file, { contentType: check.mime, upsert: false });
  if (uploadError) {
    console.error("Logo upload failed", uploadError);
    return { status: "error", message: "We couldn't upload the logo. Please try again." };
  }

  const { error } = await supabase.from("companies").update({ logo_path: path }).eq("id", company.id);
  if (error) {
    await supabase.storage.from("company-logos").remove([path]);
    return { status: "error", message: "We couldn't save the logo. Please try again." };
  }
  if (company.logo_path) await supabase.storage.from("company-logos").remove([company.logo_path]);

  revalidateCompany(company.slug);
  return { status: "success", message: "Logo updated." };
}

export async function removeCompanyLogo(): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };
  const { supabase, company } = ctx;
  if (!company.logo_path) return { status: "success" };

  const { error } = await supabase.from("companies").update({ logo_path: null }).eq("id", company.id);
  if (error) return { status: "error", message: "We couldn't remove the logo. Please try again." };
  await supabase.storage.from("company-logos").remove([company.logo_path]);

  revalidateCompany(company.slug);
  return { status: "success", message: "Logo removed." };
}

export async function resubmitRegistration(): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };
  if (ctx.company.status !== "rejected") {
    return { status: "error", message: "Only rejected registrations can be resubmitted." };
  }

  const { error } = await ctx.supabase.rpc("resubmit_company_registration");
  if (error) return { status: "error", message: "We couldn't resubmit your registration. Please try again." };

  revalidateCompany(ctx.company.slug);
  revalidatePath("/admin", "layout");
  return { status: "success", message: "Your registration has been sent for review again." };
}
