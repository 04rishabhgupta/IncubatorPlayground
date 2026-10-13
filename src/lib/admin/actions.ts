"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import type { CompanyStatus } from "@/lib/companies/queries";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { reviewDecisionSchema, type ReviewDecision } from "@/lib/validation/company";

/** Which status each decision starts from and leads to. */
const transitions: Record<ReviewDecision, { from: CompanyStatus[]; to: CompanyStatus; done: string }> = {
  approve: { from: ["pending", "rejected"], to: "approved", done: "Company approved." },
  reject: { from: ["pending"], to: "rejected", done: "Registration rejected." },
  suspend: { from: ["approved"], to: "suspended", done: "Company suspended." },
  reinstate: { from: ["suspended"], to: "approved", done: "Company reinstated." },
};

/**
 * Applies a review decision. Database triggers resolve the registration
 * request and notify the company in the same transaction.
 */
export async function reviewCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const session = await getSession();
  if (session?.profile.role !== "super_admin") {
    return { status: "error", message: "Only the platform admin can review companies.", values };
  }

  const parsed = reviewDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const { companyId, decision, reason } = parsed.data;
  const rule = transitions[decision];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ status: rule.to, status_reason: rule.to === "approved" ? null : reason })
    .eq("id", companyId)
    .in("status", rule.from) // only from a valid current status; also guards concurrent reviews
    .select("slug")
    .maybeSingle();

  if (error) {
    console.error("Company review failed", error);
    return { status: "error", message: "The decision couldn't be saved. Please try again.", values };
  }
  if (!data) {
    return {
      status: "error",
      message: "This company's status has changed since you opened the page. Reload and try again.",
      values,
    };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/directory");
  revalidatePath(`/companies/${data.slug}`);
  return { status: "success", message: rule.done };
}
