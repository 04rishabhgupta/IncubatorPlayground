"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Marks all of the caller's unread notifications as read (RLS limits it to their own). */
export async function markAllNotificationsRead() {
  const session = await getSession();
  if (!session) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", session.userId)
    .is("read_at", null);
  revalidatePath("/", "layout");
}
