"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { wallTimeToUtc } from "@/lib/appointments/time";
import { getSession } from "@/lib/auth/session";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { announcementSchema, staffMemberSchema } from "@/lib/validation/incubator";

/**
 * Super-admin actions for the FITT Incubation Team and announcements. RLS
 * restricts writes to super admins; these checks just give a friendly message.
 */

async function adminClient() {
  const session = await getSession();
  if (session?.profile.role !== "super_admin") return null;
  return createClient();
}

/** The incubator building (there is one; the first if that ever changes). */
async function building(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("buildings")
    .select("id, timezone")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}

function revalidateIncubator() {
  revalidatePath("/");
  revalidatePath("/admin/fitt-team");
  revalidatePath("/admin/announcements");
}

const notAdmin: FormState = { status: "error", message: "Only the platform admin can do this." };

// --- FITT Incubation Team ------------------------------------------------------------

export async function saveStaffMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await adminClient();
  if (!supabase) return notAdmin;

  const parsed = staffMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const input = parsed.data;

  const row = {
    full_name: input.fullName,
    job_title: input.jobTitle ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    availability: input.availability === "unknown" ? null : input.availability,
    is_public: input.isPublic,
    sort_order: input.sortOrder ? Number(input.sortOrder) : 0,
  };

  if (input.staffId) {
    const { data, error } = await supabase
      .from("incubator_staff")
      .update(row)
      .eq("id", input.staffId)
      .select("id")
      .maybeSingle();
    if (error || !data) return { status: "error", message: "The changes couldn't be saved.", values };
  } else {
    const site = await building(supabase);
    if (!site) return { status: "error", message: "No building exists yet.", values };
    const { error } = await supabase.from("incubator_staff").insert({ ...row, building_id: site.id });
    if (error) {
      console.error("Adding staff member failed", error);
      return { status: "error", message: "The team member couldn't be added.", values };
    }
  }

  revalidateIncubator();
  return {
    status: "success",
    message: input.staffId ? `${input.fullName} saved.` : `${input.fullName} added to the FITT team.`,
  };
}

export async function deleteStaffMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return notAdmin;
  const id = z.uuid().safeParse(formData.get("staffId"));
  if (!id.success) return { status: "error", message: "Unknown team member." };
  const { data, error } = await supabase
    .from("incubator_staff")
    .delete()
    .eq("id", id.data)
    .select("full_name")
    .maybeSingle();
  if (error || !data) return { status: "error", message: "The team member couldn't be removed." };
  revalidateIncubator();
  return { status: "success", message: `${data.full_name} removed from the FITT team.` };
}

// --- Announcements -------------------------------------------------------------------

export async function createAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await adminClient();
  if (!supabase) return notAdmin;

  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const input = parsed.data;

  // Times are typed in the building's time zone and stored in UTC.
  const site = await building(supabase);
  if (!site) return { status: "error", message: "No building exists yet.", values };
  const startsAt = input.startsAt ? wallTimeToUtc(input.startsAt, site.timezone) : new Date();
  const endsAt = input.endsAt ? wallTimeToUtc(input.endsAt, site.timezone) : null;
  if (!startsAt) return { status: "error", fieldErrors: { startsAt: ["That time doesn't exist."] }, values };
  if (input.endsAt && !endsAt)
    return { status: "error", fieldErrors: { endsAt: ["That time doesn't exist."] }, values };
  if (endsAt && endsAt <= startsAt) {
    return { status: "error", fieldErrors: { endsAt: ["The end must be after the start."] }, values };
  }
  if (endsAt && endsAt <= new Date()) {
    return { status: "error", fieldErrors: { endsAt: ["The end must be in the future."] }, values };
  }

  const { error } = await supabase.from("announcements").insert({
    title: input.title,
    body: input.body ?? null,
    floor_id: input.floorId === "all" ? null : input.floorId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt?.toISOString() ?? null,
  });
  if (error) {
    console.error("Announcement failed", error);
    return { status: "error", message: "The announcement couldn't be posted.", values };
  }
  revalidateIncubator();
  return {
    status: "success",
    message: startsAt > new Date() ? "Announcement scheduled." : "Announcement posted on the floor map.",
  };
}

const announcementIdSchema = z.object({ announcementId: z.uuid(), intent: z.enum(["end", "delete"]) });

export async function changeAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return notAdmin;
  const parsed = announcementIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Unknown announcement." };
  const { announcementId, intent } = parsed.data;

  const query =
    intent === "delete"
      ? supabase.from("announcements").delete().eq("id", announcementId)
      : // Ending keeps it in the history. Only a running one can end now (the end
        // must stay after the start), so a scheduled one is deleted instead.
        supabase
          .from("announcements")
          .update({ ends_at: new Date().toISOString() })
          .eq("id", announcementId)
          .lte("starts_at", new Date(Date.now() - 1000).toISOString());
  const { data, error } = await query.select("title").maybeSingle();
  if (error || !data) {
    return {
      status: "error",
      message:
        intent === "end"
          ? "Only a running announcement can be ended. Delete a scheduled one instead."
          : "The announcement couldn't be deleted.",
    };
  }
  revalidateIncubator();
  return {
    status: "success",
    message: intent === "end" ? `"${data.title}" ended.` : `"${data.title}" deleted.`,
  };
}
