import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getSupabaseSecretKey } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Privileged client that BYPASSES Row Level Security. Use only in server code
 * for operations that cannot be expressed as the signed-in user (e.g. sending
 * a notification on someone else's behalf), and always authorize the caller
 * first.
 */
export function createAdminClient() {
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
