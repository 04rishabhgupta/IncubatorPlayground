import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting as the signed-in user (RLS applies). Create one per request.
 * Reading cookies makes the caller dynamic, so render it inside <Suspense>.
 *
 * connection() pins every use to request time: supabase-js reads the clock
 * (token expiry) on each query, which Cache Components rejects while
 * prerendering or prefetching.
 */
export async function createClient() {
  await connection();
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies; the proxy refreshes the
            // session on the next request instead.
          }
        },
      },
    },
  );
}
