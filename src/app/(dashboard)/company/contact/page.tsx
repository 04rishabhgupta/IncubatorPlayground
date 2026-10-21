import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contact form messages" };

const delivery = {
  pending: "Sending",
  sent: "Emailed to you",
  not_configured: "In the app only (email not set up)",
  failed: "Email failed; shown here only",
} as const;

/** Messages sent through the contact form on the company's profile. */
export default async function CompanyContactPage() {
  const { userId } = await requireRole(["company"], "/company/contact");
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  const { data, error } = company
    ? await supabase
        .from("contact_messages")
        .select("id, sender_name, sender_email, subject, body, status, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Contact form messages"
        description="Emails people sent through your profile. Reply to the sender's address; it goes straight to them."
        action={
          <ButtonLink href="/company" variant="secondary">
            Back to dashboard
          </ButtonLink>
        }
      />
      {error ? (
        <Alert tone="error">Messages couldn&apos;t be loaded. Please refresh the page.</Alert>
      ) : !data?.length ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No messages yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((m) => (
            <li key={m.id} className="space-y-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{m.subject}</p>
                <time dateTime={m.created_at} className="text-xs text-muted">
                  {formatDate(m.created_at, "datetime")}
                </time>
              </div>
              <p className="text-sm text-muted">
                From {m.sender_name} ·{" "}
                <a
                  href={`mailto:${m.sender_email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
                  className="text-brand-700 hover:underline"
                >
                  {m.sender_email}
                </a>
              </p>
              <p className="whitespace-pre-line text-sm text-ink">{m.body}</p>
              <p className="text-xs text-muted">{delivery[m.status as keyof typeof delivery] ?? m.status}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
