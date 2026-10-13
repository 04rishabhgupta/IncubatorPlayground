import "server-only";
import type { AvailabilityStatus } from "@/lib/companies/queries";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

/**
 * Appointment reads. RLS limits every query to appointments the caller is
 * part of (requester, the company's owner) or, for admins, all of them.
 */

export type AppointmentStatus = Enums<"appointment_status">;
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export type Appointment = {
  id: string;
  company_id: string;
  requester_id: string;
  member_id: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  meeting_type: Enums<"meeting_type">;
  purpose: string;
  meeting_link: string | null;
  location_note: string | null;
  status: AppointmentStatus;
  decision_note: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  created_at: string;
  company: { name: string; slug: string; logo_path: string | null } | null;
  member: { full_name: string; job_title: string | null } | null;
  requester: { full_name: string; email: string } | null;
};

const appointmentColumns =
  "id, company_id, requester_id, member_id, starts_at, ends_at, timezone, meeting_type, purpose, meeting_link, location_note, status, decision_note, cancellation_reason, cancelled_by, created_at, " +
  "company:companies(name, slug, logo_path), " +
  "member:company_team_members(full_name, job_title), " +
  "requester:profiles!appointments_requester_id_fkey(full_name, email)";

export type BookingContext = {
  company: { id: string; name: string; slug: string; logo_path: string | null; owner_id: string };
  timezone: string;
  members: Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    availability: { status: AvailabilityStatus; updated_at: string } | null;
  }>;
  availability: { status: AvailabilityStatus; note: string | null; updated_at: string } | null;
};

/** What the booking form needs: approved company, its bookable public team and its time zone. */
export async function getBookingContext(slug: string): Promise<BookingContext | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select(
      "id, name, slug, logo_path, owner_id, status, " +
        "floor:floors(building:buildings(timezone)), " +
        "availability:company_availability(status, note, updated_at), " +
        "members:company_team_members(id, full_name, job_title, sort_order, is_public, is_bookable, availability:member_availability(status, updated_at))",
    )
    .eq("slug", slug)
    .eq("status", "approved")
    .eq("members.is_public", true)
    .eq("members.is_bookable", true)
    .order("sort_order", { referencedTable: "members" })
    .maybeSingle()
    .overrideTypes<
      {
        id: string;
        name: string;
        slug: string;
        logo_path: string | null;
        owner_id: string;
        floor: { building: { timezone: string } | null } | null;
        availability: BookingContext["availability"];
        members: BookingContext["members"];
      },
      { merge: false }
    >();
  if (!data) return null;
  return {
    company: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      logo_path: data.logo_path,
      owner_id: data.owner_id,
    },
    timezone: data.floor?.building?.timezone ?? DEFAULT_TIMEZONE,
    members: data.members,
    availability: data.availability,
  };
}

/** Accepted meeting times for a representative (no details about who booked them). */
export async function getBusyTimes(memberId: string, from: Date, to: Date) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_busy_times", {
    p_member_id: memberId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({ start: r.starts_at, end: r.ends_at }));
}

/** Appointments the user requested, newest first. */
export async function listMyAppointments(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(appointmentColumns)
    .eq("requester_id", userId)
    .order("starts_at", { ascending: false })
    .limit(200)
    .overrideTypes<Appointment[], { merge: false }>();
  if (error) throw error;
  return data;
}

/** All appointments for a company (owner view). */
export async function listCompanyAppointments(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(appointmentColumns)
    .eq("company_id", companyId)
    .order("starts_at", { ascending: true })
    .limit(500)
    .overrideTypes<Appointment[], { merge: false }>();
  if (error) throw error;
  return data;
}

export async function listAppointmentsForAdmin() {
  const supabase = await createClient();
  const statuses: AppointmentStatus[] = ["pending", "accepted", "rejected", "cancelled", "completed"];
  const [list, ...counts] = await Promise.all([
    supabase
      .from("appointments")
      .select(appointmentColumns)
      .order("created_at", { ascending: false })
      .limit(100)
      .overrideTypes<Appointment[], { merge: false }>(),
    ...statuses.map((s) =>
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", s),
    ),
  ]);
  if (list.error) throw list.error;
  return {
    appointments: list.data,
    counts: Object.fromEntries(statuses.map((s, i) => [s, counts[i].count ?? 0])) as Record<
      AppointmentStatus,
      number
    >,
  };
}

/** Pending requests still in the future, for the company dashboard badge. */
export async function countPendingRequests(companyId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending")
    .gt("ends_at", new Date().toISOString());
  return count ?? 0;
}
