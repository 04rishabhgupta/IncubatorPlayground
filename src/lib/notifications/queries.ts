import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Notifications are private: RLS returns only the caller's own rows. */
export async function countUnreadNotifications() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return error ? 0 : (count ?? 0);
}

export async function listNotifications(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
