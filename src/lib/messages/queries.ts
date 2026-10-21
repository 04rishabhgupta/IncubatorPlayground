import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Chat reads. Conversations are private to their two members by RLS (not even
 * the admin can read them), so every query here runs as the signed-in user.
 */

export type ConversationSummary = {
  id: string;
  company_id: string;
  company_slug: string | null;
  my_role: "visitor" | "company";
  other_name: string;
  subject: string | null;
  last_message_at: string | null;
  last_body: string | null;
  last_from_me: boolean | null;
  unread: number;
};

export type ChatMessage = { id: string; sender_id: string | null; body: string; created_at: string };

export const PAGE_SIZE = 50;

export async function listMyConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}

/** Unread messages across all conversations (for the header badge). */
export async function countUnreadMessages() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) return 0;
  return (data ?? []).reduce((sum, c) => sum + (c.unread ?? 0), 0);
}

export type ConversationDetail = {
  id: string;
  subject: string | null;
  myRole: "visitor" | "company";
  otherName: string;
  /** Link to the company profile when the other side is the company. */
  companySlug: string | null;
  companyName: string | null;
  otherLastReadAt: string | null;
  messages: ChatMessage[];
  hasMore: boolean;
};

export async function getConversation(id: string, userId: string): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const [summaries, membersRes, messagesRes] = await Promise.all([
    listMyConversations(),
    supabase
      .from("conversation_members")
      .select("profile_id, member_role, last_read_at")
      .eq("conversation_id", id),
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (messagesRes.error) throw messagesRes.error;

  const summary = summaries.find((c) => c.id === id);
  if (!summary) return null; // not a member (or no such conversation)
  const other = (membersRes.data ?? []).find((m) => m.profile_id !== userId);
  const rows = messagesRes.data ?? [];

  let companyName: string | null = null;
  if (summary.my_role === "visitor") companyName = summary.other_name;

  return {
    id,
    subject: summary.subject,
    myRole: summary.my_role,
    otherName: summary.other_name,
    companySlug: summary.my_role === "visitor" ? summary.company_slug : null,
    companyName,
    otherLastReadAt: other?.last_read_at ?? null,
    messages: rows.slice(0, PAGE_SIZE).reverse(),
    hasMore: rows.length > PAGE_SIZE,
  };
}
