"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { messageBodySchema } from "@/lib/validation/messages";
import { PAGE_SIZE, type ChatMessage } from "./queries";

/**
 * Chat actions. All run as the signed-in user: RLS keeps conversations
 * private and the database sets timestamps, limits sending and notifies the
 * other member.
 */

const startSchema = z.object({
  companyId: z.uuid(),
  /** Where to come back to after signing in (the company's profile or the map). */
  returnTo: z.string().startsWith("/").max(300).optional().default("/"),
});

/** "Message this company": open (or reuse) the conversation and go there. */
export async function startConversation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = startSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "This company can't be messaged." };
  const { companyId, returnTo } = parsed.data;

  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("start_conversation", {
    p_company_id: companyId,
    p_subject: "",
  });
  if (error || !id) {
    const message = /own company/.test(error?.message ?? "")
      ? "This is your own company."
      : /only visitor and company accounts/.test(error?.message ?? "")
        ? "Admin accounts can't start conversations."
        : "This company can't be messaged right now.";
    return { status: "error", message };
  }
  redirect(`/messages/${id}`);
}

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export async function sendMessage(conversationId: string, body: string): Promise<SendResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const id = z.uuid().safeParse(conversationId);
  const text = messageBodySchema.safeParse(body);
  if (!id.success) return { ok: false, error: "Unknown conversation." };
  if (!text.success) return { ok: false, error: text.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: id.data, sender_id: session.userId, body: text.data })
    .select("id, sender_id, body, created_at")
    .single();
  if (error || !data) {
    if (/too quickly/.test(error?.message ?? "")) {
      return { ok: false, error: "You're sending messages too quickly. Wait a minute and try again." };
    }
    console.error("Message failed", error);
    return { ok: false, error: "The message couldn't be sent. Please try again." };
  }
  revalidatePath("/messages");
  return { ok: true, message: data };
}

/** Mark a conversation read: the "Seen" state, and its message notifications. */
export async function markConversationRead(conversationId: string) {
  const session = await getSession();
  const id = z.uuid().safeParse(conversationId);
  if (!session || !id.success) return;
  const supabase = await createClient();
  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from("conversation_members")
      .update({ last_read_at: now })
      .eq("conversation_id", id.data)
      .eq("profile_id", session.userId),
    supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("type", "message_received")
      .is("read_at", null)
      .eq("data->>conversation_id", id.data),
  ]);
}

/** Older messages for "Load earlier messages". */
export async function loadEarlierMessages(
  conversationId: string,
  before: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const id = z.uuid().safeParse(conversationId);
  const at = z.iso.datetime({ offset: true }).safeParse(before);
  if (!id.success || !at.success) return { messages: [], hasMore: false };
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", id.data)
    .lt("created_at", at.data)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  const rows = data ?? [];
  return { messages: rows.slice(0, PAGE_SIZE).reverse(), hasMore: rows.length > PAGE_SIZE };
}
