import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * GET /api/health — reports whether the app is configured and can reach the
 * database through the public (RLS-restricted) API. Exposes no secrets.
 */
export async function GET() {
  await connection();

  let env;
  try {
    env = getPublicEnv();
  } catch {
    return Response.json({ status: "error", database: "not_configured" }, { status: 503 });
  }

  const supabase = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.from("floors").select("id", { head: true, count: "exact" });

  if (error) {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
  return Response.json({ status: "ok", database: "reachable" });
}
