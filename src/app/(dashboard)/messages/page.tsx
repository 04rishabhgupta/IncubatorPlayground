import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { listMyConversations } from "@/lib/messages/queries";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireRole(["visitor", "company"], "/messages");

  let conversations;
  try {
    conversations = await listMyConversations();
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Your messages couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }

  return (
    <>
      <LiveRefresh channel="inbox" tables={["messages"]} />
      <PageHeader
        title="Messages"
        description="Your conversations with companies on the floor (and, for company accounts, with visitors). Only you and the other side can read them."
        action={
          <ButtonLink href="/directory" variant="secondary">
            Find a company
          </ButtonLink>
        }
      />
      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No conversations yet. Open a company&apos;s profile or click it on the floor map, then choose
          &ldquo;Message&rdquo;.
        </div>
      ) : (
        <ul
          aria-label="Conversations"
          className="divide-y divide-border rounded-xl border border-border bg-surface"
        >
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-surface-muted"
                aria-label={`${c.other_name}${c.unread ? `, ${c.unread} unread` : ""}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">
                  {c.other_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm text-ink", c.unread > 0 && "font-semibold")}>
                      {c.other_name}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {c.my_role === "company" ? "Visitor" : "Company"}
                      </span>
                    </span>
                    {c.last_message_at && (
                      <time dateTime={c.last_message_at} className="shrink-0 text-xs text-muted">
                        {formatDate(c.last_message_at, "datetime")}
                      </time>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread > 0 ? "text-ink" : "text-muted")}>
                      {c.last_body ? `${c.last_from_me ? "You: " : ""}${c.last_body}` : "No messages yet"}
                    </span>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-accent-500 px-2 text-xs font-semibold leading-5 text-white">
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
