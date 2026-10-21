import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { ConversationView } from "@/components/messages/conversation-view";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth/session";
import { getConversation } from "@/lib/messages/queries";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const session = await requireRole(["visitor", "company"], `/messages/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let conversation;
  try {
    conversation = await getConversation(id, session.userId);
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">This conversation couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }
  // Not a member reads exactly like "doesn't exist": nothing to learn from guessing ids.
  if (!conversation) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/messages" className="text-sm text-brand-700 hover:underline">
          <span aria-hidden="true">←</span> All messages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{conversation.otherName}</h1>
        <p className="text-sm text-muted">
          {conversation.myRole === "company" ? "Visitor" : "Company"}
          {conversation.companySlug && (
            <>
              {" · "}
              <Link
                href={`/companies/${conversation.companySlug}`}
                className="text-brand-700 hover:underline"
              >
                View profile
              </Link>
            </>
          )}
          {" · Only the two of you can read this conversation."}
        </p>
      </div>
      <ConversationView
        conversationId={conversation.id}
        myId={session.userId}
        otherName={conversation.otherName}
        initialMessages={conversation.messages}
        initialHasMore={conversation.hasMore}
        initialOtherReadAt={conversation.otherLastReadAt}
      />
    </div>
  );
}
