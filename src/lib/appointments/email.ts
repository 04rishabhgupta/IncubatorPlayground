import "server-only";
import { sendEmail } from "@/lib/email/send";
import { appointmentEmail, type AppointmentEvent } from "@/lib/email/templates";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatRange } from "./time";

/**
 * Email copy of an appointment notification (the in-app notification comes
 * from a database trigger). Called from `after()` in the appointment actions,
 * so it never delays or fails the action; it reads as the acting user, who
 * can see both sides of their own appointment under RLS.
 *
 *   requested            → the company's business email
 *   accepted / rejected  → the requester
 *   cancelled            → whoever didn't cancel
 */
export async function emailAppointment(appointmentId: string, event: AppointmentEvent, actorId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "starts_at, ends_at, timezone, cancellation_reason, decision_note, requester_id, " +
        "company:companies(name, business_email, owner_id), requester:profiles(full_name, email)",
    )
    .eq("id", appointmentId)
    .maybeSingle()
    .overrideTypes<
      {
        starts_at: string;
        ends_at: string;
        timezone: string;
        cancellation_reason: string | null;
        decision_note: string | null;
        requester_id: string;
        company: { name: string; business_email: string; owner_id: string } | null;
        requester: { full_name: string; email: string } | null;
      },
      { merge: false }
    >();
  if (!data?.company || !data.requester) return;

  const toCompany = event === "requested" || (event === "cancelled" && actorId === data.requester_id);
  const to = toCompany ? data.company.business_email : data.requester.email;
  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const content = appointmentEmail({
    event,
    companyName: data.company.name,
    requesterName: data.requester.full_name.trim() || data.requester.email,
    when: formatRange(new Date(data.starts_at), new Date(data.ends_at), data.timezone),
    reason:
      event === "cancelled" ? data.cancellation_reason : event === "rejected" ? data.decision_note : null,
    url: `${site}${toCompany ? "/company/appointments" : "/account/appointments"}`,
  });
  const result = await sendEmail(to, content);
  if (result.status === "failed") console.error(`Appointment email (${event}) failed: ${result.error}`);
}
