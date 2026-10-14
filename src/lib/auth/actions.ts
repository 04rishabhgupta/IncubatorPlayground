"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkLogoFile } from "@/lib/files";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  companyRegistrationSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  updatePasswordSchema,
  visitorRegistrationSchema,
} from "@/lib/validation/auth";
import { homeForRole, safeNextPath } from "./roles";
import { authConfirmUrl } from "./urls";
import { getSession } from "./session";

const SECRET_FIELDS = ["password", "confirmPassword"];

/** Map Supabase Auth errors to user-facing messages without leaking account existence. */
function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Please confirm your email address first. Check your inbox for the confirmation link.";
    case "weak_password":
      return "That password is too weak. Use at least 8 characters with upper- and lowercase letters and a number.";
    case "same_password":
      return "Choose a password different from your current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "email_address_invalid":
      return "This email address cannot be used. Please try another.";
    case "signup_disabled":
      return "Registration is currently closed.";
    default:
      if (/sending .*email/i.test(error.message)) {
        return "We couldn't send the confirmation email right now. Please try again later.";
      }
      return "Something went wrong. Please try again.";
  }
}

// --- Sign in / out ------------------------------------------------------------

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, SECRET_FIELDS);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { status: "error", message: error ? authErrorMessage(error) : undefined, values };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")) ?? homeForRole(profile?.role ?? "visitor"));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// --- Registration -----------------------------------------------------------------

export async function registerVisitor(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, SECRET_FIELDS);
  const parsed = visitorRegistrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };

  const { fullName, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: authConfirmUrl("/account") },
  });
  if (error) return { status: "error", message: authErrorMessage(error), values };

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/account");
  }
  redirect("/check-email");
}

export async function registerCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, SECRET_FIELDS);
  const parsed = companyRegistrationSchema.safeParse(Object.fromEntries(formData));
  const fieldErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error);

  const logo = formData.get("logo");
  const logoFile = logo instanceof File && logo.size > 0 ? logo : null;
  const logoCheck = logoFile ? await checkLogoFile(logoFile) : null;
  if (logoCheck && !logoCheck.ok) fieldErrors.logo = [logoCheck.error];

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, values };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { data: industry } = await supabase
    .from("industries")
    .select("slug")
    .eq("slug", input.industry)
    .maybeSingle();
  if (!industry) return { status: "error", fieldErrors: { industry: ["Choose an industry."] }, values };

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: authConfirmUrl("/company"),
      data: {
        account_type: "company",
        full_name: input.fullName,
        company: {
          name: input.companyName,
          industry_slug: industry.slug,
          tagline: input.tagline ?? "",
          description: input.description,
          website: input.website ?? "",
          business_email: input.email,
          phone: input.phone ?? "",
          office_details: input.officeDetails ?? "",
          founded_year: input.foundedYear ?? "",
        },
      },
    },
  });

  if (error) {
    // The signup trigger rejects invalid company data; Auth reports that as a
    // generic "Database error saving new user".
    const message = /database error/i.test(error.message)
      ? "We couldn't create the company account. Please check the details and try again."
      : authErrorMessage(error);
    return { status: "error", message, values };
  }

  // With email confirmation on, an already-registered email returns a user with
  // no identities and no email is sent. Show the same screen either way.
  const isNewUser = (data.user?.identities?.length ?? 0) > 0;
  let logoFailed = false;
  if (isNewUser && data.user && logoCheck?.ok && logoFile) {
    logoFailed = !(await uploadInitialLogo(data.user.id, logoFile, logoCheck.mime, logoCheck.ext));
  }

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/company");
  }
  redirect(logoFailed ? "/check-email?logo=failed" : "/check-email");
}

/**
 * The new account has no session until the email is confirmed, so the logo is
 * stored with the admin client. Safe because the target company is looked up
 * by the user id that Supabase Auth returned to this very request.
 */
async function uploadInitialLogo(userId: string, file: File, mime: string, ext: string) {
  try {
    const admin = createAdminClient();
    const { data: company } = await admin.from("companies").select("id").eq("owner_id", userId).single();
    if (!company) return false;

    const path = `${company.id}/logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("company-logos")
      .upload(path, file, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;

    const { error: updateError } = await admin
      .from("companies")
      .update({ logo_path: path })
      .eq("id", company.id);
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    console.error("Initial logo upload failed", error);
    return false;
  }
}

export async function resendConfirmation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: authConfirmUrl() },
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { status: "error", message: authErrorMessage(error) };
  }
  return {
    status: "success",
    message: "If that account is waiting for confirmation, a new link is on its way.",
  };
}

// --- Passwords --------------------------------------------------------------------

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authConfirmUrl("/settings/password"),
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { status: "error", message: authErrorMessage(error), values };
  }
  return {
    status: "success",
    message: "If an account exists for that email, we've sent a link to reset your password.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Your session has expired. Please sign in again." };

  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };
  return { status: "success", message: "Your password has been updated." };
}

// --- Profile --------------------------------------------------------------------------

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const session = await getSession();
  if (!session)
    return { status: "error", message: "Your session has expired. Please sign in again.", values };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone ?? null })
    .eq("id", session.userId);
  if (error) return { status: "error", message: "We couldn't save your profile. Please try again.", values };

  revalidatePath("/", "layout");
  return { status: "success", message: "Profile saved.", values };
}
