"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/send";
import { contactEmail } from "@/lib/email/templates";
import { fieldErrorsFrom, formValues, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { contactFormSchema } from "@/lib/validation/messages";

/**
 * The email contact form on a company profile (signed-in users only).
 *
 * 1. Log the message in contact_messages, as the user. The database fills in
 *    the sender from the account, refuses unapproved/own companies, applies
 *    the limits (3 an hour per sender, 20 a day per company) and notifies the
 *    company in the app.
 * 2. Email it to the company's business address with the sender as Reply-To.
 * 3. Record the outcome: sent, not_configured (no email provider yet) or failed.
 */
export async function sendContactMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["website"]);
  const session = await getSession();
  if (!session) return { status: "error", message: "Please sign in to contact the company.", values };

  const parsed = contactFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    // The hidden spam field was filled: answer like a success, send nothing.
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      return { status: "success", message: "Thanks, your message was sent." };
    }
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { data: logged, error } = await supabase
    .from("contact_messages")
    .insert({
      company_id: input.companyId,
      sender_name: input.name,
      sender_email: session.profile.email, // replaced by the database from the account anyway
      subject: input.subject,
      body: input.body,
    })
    .select("id, sender_name, sender_email, company:companies(name, business_email)")
    .single()
    .overrideTypes<
      {
        id: string;
        sender_name: string;
        sender_email: string;
        company: { name: string; business_email: string } | null;
      },
      { merge: false }
    >();

  if (error || !logged?.company) {
    const message = error?.message ?? "";
    const known = [/in the last hour/, /many messages today/, /own company/, /can't be contacted/];
    const friendly = known.some((re) => re.test(message))
      ? `${message.replace(/^./, (c) => c.toUpperCase())}.`
      : "Your message couldn't be sent. Please try again.";
    if (!known.some((re) => re.test(message))) console.error("Contact message failed", error);
    return { status: "error", message: friendly, values };
  }

  const result = await sendEmail(
    logged.company.business_email,
    contactEmail({
      companyName: logged.company.name,
      senderName: logged.sender_name,
      senderEmail: logged.sender_email,
      subject: input.subject,
      body: input.body,
    }),
    { replyTo: logged.sender_email },
  );
  await supabase.rpc("set_contact_delivery", {
    p_id: logged.id,
    p_status: result.status,
    p_error: result.status === "failed" ? result.error : "",
  });

  revalidatePath("/company/contact");
  return {
    status: "success",
    message:
      result.status === "sent"
        ? `Sent. ${logged.company.name} will reply to ${logged.sender_email}.`
        : result.status === "not_configured"
          ? `Sent to ${logged.company.name} in the app. Email delivery isn't set up yet, so they'll see it in their dashboard.`
          : `Saved for ${logged.company.name}, but the email couldn't be delivered. They'll still see it in their dashboard.`,
  };
}
