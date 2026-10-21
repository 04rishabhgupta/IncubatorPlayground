"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ownCompany } from "@/lib/companies/owner";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { bookingSchema, cancelSchema, responseSchema } from "@/lib/validation/appointments";
import { emailAppointment } from "./email";
import { checkSlot, overlaps } from "./rules";
import { getBookingContext, getBusyTimes } from "./queries";
import { wallTimeToUtc } from "./time";

/**
 * Appointment workflow. Each action authorizes the caller, validates input,
 * then writes as that user so RLS and the guard trigger apply. The database
 * is the final authority; these checks make errors friendly and early.
 */

/** Translate database errors into messages people understand. */
function friendlyError(error: PostgrestError, fallback: string) {
  if (error.code === "23P01") {
    return "That representative already has an accepted meeting at this time.";
  }
  const known = [
    /at least 1 hour in the future/,
    /at most 60 days ahead/,
    /between 08:00 and 20:00/,
    /15-minute intervals/,
    /duration must be/,
    /already have a pending request/,
    /at most 3 pending requests/,
    /not accepting appointment requests/,
    /cannot book appointments with themselves/,
    /invalid appointment status change/,
  ];
  if (known.some((re) => re.test(error.message))) {
    const text = error.message.replace(/^./, (c) => c.toUpperCase());
    return text.endsWith(".") ? text : `${text}.`;
  }
  console.error("Appointment write failed", error);
  return fallback;
}

function revalidateAppointments() {
  revalidatePath("/account/appointments");
  revalidatePath("/company/appointments");
  revalidatePath("/admin/appointments");
  revalidatePath("/notifications");
}

export async function requestAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const session = await getSession();
  if (!session) return { status: "error", message: "Please sign in to request an appointment.", values };

  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const input = parsed.data;

  const context = await getBookingContext(input.companySlug);
  if (!context)
    return { status: "error", message: "This company isn't accepting appointment requests.", values };
  if (context.company.owner_id === session.userId) {
    return { status: "error", message: "You can't book an appointment with your own company.", values };
  }
  if (input.memberId && !context.members.some((m) => m.id === input.memberId)) {
    return {
      status: "error",
      fieldErrors: { memberId: ["This person isn't taking appointment requests."] },
      values,
    };
  }

  const slot = checkSlot(
    { date: input.date, time: input.time },
    input.duration,
    context.timezone,
    new Date(),
  );
  if (!slot.ok) return { status: "error", fieldErrors: { time: [slot.error] }, values };

  if (input.memberId) {
    const busy = await getBusyTimes(input.memberId, slot.start, slot.end);
    if (busy.some((b) => overlaps(new Date(b.start), new Date(b.end), slot.start, slot.end))) {
      return {
        status: "error",
        fieldErrors: { time: ["That time is already booked for this person. Please choose another."] },
        values,
      };
    }
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("appointments")
    .insert({
      company_id: context.company.id,
      requester_id: session.userId,
      member_id: input.memberId ?? null,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      meeting_type: input.meetingType,
      purpose: input.purpose,
    })
    .select("id")
    .single();
  if (error || !created) {
    return {
      status: "error",
      message: error
        ? friendlyError(error, "Your request couldn't be sent. Please try again.")
        : "Your request couldn't be sent. Please try again.",
      values,
    };
  }

  // Email copies go out after the response, so they never slow down or fail the request.
  after(() => emailAppointment(created.id, "requested", session.userId));
  revalidateAppointments();
  redirect("/account/appointments?done=requested");
}

/** Busy ranges for one representative on one building-local day (for the booking form). */
export async function fetchBusyTimes(memberId: string, date: string, timeZone: string) {
  const session = await getSession();
  if (!session || !/^[0-9a-f-]{36}$/i.test(memberId)) return [];
  const from = wallTimeToUtc({ date, time: "00:00" }, timeZone);
  const to = from ? new Date(from.getTime() + 24 * 60 * 60_000) : null;
  if (!from || !to) return [];
  return getBusyTimes(memberId, from, to);
}

export async function respondToAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error, values };

  const parsed = responseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  const input = parsed.data;

  const { data, error } = await ctx.supabase
    .from("appointments")
    .update({
      status: input.decision === "accept" ? "accepted" : "rejected",
      decision_note: input.note ?? null,
      meeting_link: input.decision === "accept" ? (input.meetingLink ?? null) : null,
      location_note: input.decision === "accept" ? (input.locationNote ?? null) : null,
    })
    .eq("id", input.appointmentId)
    .eq("company_id", ctx.company.id)
    .eq("status", "pending") // already decided or cancelled → no row
    .select("id")
    .maybeSingle();

  if (error)
    return { status: "error", message: friendlyError(error, "The decision couldn't be saved."), values };
  if (!data) {
    return {
      status: "error",
      message: "This request was already answered or cancelled. Refresh the page.",
      values,
    };
  }
  after(() => emailAppointment(data.id, input.decision === "accept" ? "accepted" : "rejected", ctx.userId));
  revalidateAppointments();
  // The item leaves the "Requests" tab, so confirm at page level rather than in the card.
  redirect(`/company/appointments?tab=pending&done=${input.decision === "accept" ? "accepted" : "declined"}`);
}

/** Requester cancels a pending/accepted appointment, or the company cancels an accepted one. */
export async function cancelAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Please sign in again." };

  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled", cancellation_reason: parsed.data.note ?? null })
    .eq("id", parsed.data.appointmentId)
    .in("status", ["pending", "accepted"])
    .gt("ends_at", new Date().toISOString())
    .select("id, requester_id")
    .maybeSingle();

  if (error)
    return { status: "error", message: friendlyError(error, "The appointment couldn't be cancelled.") };
  if (!data)
    return { status: "error", message: "This appointment can no longer be cancelled. Refresh the page." };
  after(() => emailAppointment(data.id, "cancelled", session.userId));
  revalidateAppointments();
  redirect(
    data.requester_id === session.userId
      ? "/account/appointments?done=cancelled"
      : "/company/appointments?tab=upcoming&done=cancelled",
  );
}

export async function completeAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ownCompany();
  if ("error" in ctx) return { status: "error", message: ctx.error };
  const id = String(formData.get("appointmentId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: "error", message: "Unknown appointment." };

  const { data, error } = await ctx.supabase
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", id)
    .eq("company_id", ctx.company.id)
    .eq("status", "accepted")
    .lte("starts_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error)
    return { status: "error", message: friendlyError(error, "The appointment couldn't be updated.") };
  if (!data)
    return { status: "error", message: "Only accepted meetings that have started can be completed." };
  revalidateAppointments();
  redirect("/company/appointments?tab=past&done=completed");
}
