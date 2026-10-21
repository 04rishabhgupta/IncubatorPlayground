"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * Office placement for super admins. Each action is one UPDATE on companies;
 * the database enforces office-only placement and one company per office
 * (unique space_id), and a trigger notifies the company.
 */

const placementSchema = z.object({
  intent: z.enum(["assign", "move", "remove"]),
  companyId: z.uuid("Choose a company."),
  spaceId: z.uuid("Choose an office.").optional(),
});

const spaceSchema = z.object({
  spaceId: z.uuid(),
  label: z.string().trim().min(1, "Enter a name.").max(80, "Keep the name under 80 characters."),
  capacity: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine((v) => v === undefined || (/^\d+$/.test(v) && +v >= 1 && +v <= 500), {
      message: "Enter a number between 1 and 500.",
    }),
});

async function requireAdmin() {
  const session = await getSession();
  return session?.profile.role === "super_admin";
}

function revalidateFloor() {
  revalidatePath("/");
  revalidatePath("/admin/floor");
  revalidatePath("/directory");
  revalidatePath("/companies/[slug]", "page");
}

export async function updatePlacement(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireAdmin()))
    return { status: "error", message: "Only the platform admin can place companies." };

  const parsed = placementSchema.safeParse({
    intent: formData.get("intent"),
    companyId: formData.get("companyId") || undefined,
    spaceId: formData.get("spaceId") || undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { intent, companyId, spaceId } = parsed.data;

  const supabase = await createClient();

  if (intent === "remove") {
    const { data, error } = await supabase
      .from("companies")
      .update({ space_id: null, floor_id: null })
      .eq("id", companyId)
      .select("name")
      .maybeSingle();
    if (error || !data)
      return { status: "error", message: "The company couldn't be removed from its office." };
    revalidateFloor();
    return { status: "success", message: `${data.name} was removed from its office.` };
  }

  if (!spaceId) return { status: "error", fieldErrors: { spaceId: ["Choose an office."] } };
  const { data: space } = await supabase
    .from("floor_spaces")
    .select("id, floor_id, kind, label")
    .eq("id", spaceId)
    .maybeSingle();
  if (!space || space.kind !== "office") {
    return { status: "error", fieldErrors: { spaceId: ["Companies can only be placed in offices."] } };
  }

  let query = supabase
    .from("companies")
    .update({ floor_id: space.floor_id, space_id: space.id })
    .eq("id", companyId);
  // Assign only companies without an office; move only companies that have one.
  query =
    intent === "assign"
      ? query.is("space_id", null).eq("status", "approved")
      : query.not("space_id", "is", null);
  const { data, error } = await query.select("name").maybeSingle();

  if (error?.code === "23505") {
    return {
      status: "error",
      message: `${space.label} is no longer vacant. Reload the page and choose another office.`,
    };
  }
  if (error) {
    console.error("Placement failed", error);
    return { status: "error", message: "The change couldn't be saved. Please try again." };
  }
  if (!data) {
    return {
      status: "error",
      message: "This company's placement has changed since the page loaded. Reload and try again.",
    };
  }

  revalidateFloor();
  return {
    status: "success",
    message:
      intent === "assign"
        ? `${data.name} was assigned to ${space.label}.`
        : `${data.name} moved to ${space.label}.`,
  };
}

export async function updateSpaceDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireAdmin()))
    return { status: "error", message: "Only the platform admin can edit offices." };

  const parsed = spaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("floor_spaces")
    .update({
      label: parsed.data.label,
      capacity: parsed.data.capacity ? Number(parsed.data.capacity) : null,
    })
    .eq("id", parsed.data.spaceId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: "The space couldn't be updated." };

  revalidateFloor();
  return { status: "success", message: "Space details saved." };
}

/** Close a company's office request without placing it; a trigger tells the company. */
export async function closeOfficeRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireAdmin()))
    return { status: "error", message: "Only the platform admin can close office requests." };
  const companyId = z.uuid().safeParse(formData.get("companyId"));
  if (!companyId.success) return { status: "error", message: "Unknown company." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("office_requests")
    .delete()
    .eq("company_id", companyId.data)
    .select("company_id")
    .maybeSingle();
  if (error || !data)
    return { status: "error", message: "The request couldn't be closed. It may already be closed." };
  revalidateFloor();
  revalidatePath("/admin");
  return { status: "success", message: "Request closed. The company has been notified." };
}

const floorDetailsSchema = z.object({
  floorId: z.string().uuid("Invalid floor id."),
  name: z.string().trim().min(1, "Enter a floor name.").max(60, "Keep the name under 60 characters."),
  tagline: z
    .string()
    .trim()
    .max(160, "Keep the tagline under 160 characters.")
    .optional()
    .transform((v) => v || null),
  description: z
    .string()
    .trim()
    .max(1000, "Keep the description under 1000 characters.")
    .optional()
    .transform((v) => v || null),
  isActive: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "on"),
});

export async function updateFloorDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireAdmin()))
    return { status: "error", message: "Only the platform admin can edit floors." };

  const parsed = floorDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("floors")
    .update({
      name: parsed.data.name,
      tagline: parsed.data.tagline,
      description: parsed.data.description,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.floorId)
    .select("slug, name")
    .maybeSingle();

  if (error || !data) {
    console.error("Floor update failed", error);
    return { status: "error", message: "The floor details couldn't be saved." };
  }

  revalidateFloor();
  return { status: "success", message: `${data.name} details saved.` };
}
