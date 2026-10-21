"use server";

import { z } from "zod";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { ownCompany, revalidateCompany } from "./owner";

const officeRequestSchema = z.object({
  spaceId: z.union([z.uuid("Choose an office."), z.literal("any")]),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters.")
    .transform((v) => (v === "" ? null : v))
    .optional()
    .default(null),
});

/** Send or update the company's office request (one per company). */
export async function saveOfficeRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error, values };
  if (ctx.company.status !== "approved") {
    return { status: "error", message: "You can request an office once your company is approved.", values };
  }

  const parsed = officeRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };

  const { supabase, company } = ctx;
  const { error } = await supabase.from("office_requests").upsert({
    company_id: company.id,
    space_id: parsed.data.spaceId === "any" ? null : parsed.data.spaceId,
    note: parsed.data.note,
  });
  if (error) {
    console.error("Office request failed", error);
    const message = /already has an office/.test(error.message)
      ? "Your company already has an office."
      : "Your request couldn't be sent. Please try again.";
    return { status: "error", message, values };
  }

  revalidateCompany(company.slug);
  return { status: "success", message: "Request sent. The platform admin will be in touch.", values };
}

export async function withdrawOfficeRequest(): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };
  const { error } = await ctx.supabase.from("office_requests").delete().eq("company_id", ctx.company.id);
  if (error) return { status: "error", message: "Your request couldn't be withdrawn. Please try again." };
  revalidateCompany(ctx.company.slug);
  return { status: "success", message: "Request withdrawn." };
}
