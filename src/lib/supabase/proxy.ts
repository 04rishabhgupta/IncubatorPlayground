import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth/roles";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session cookie on every matched request so Server
 * Components always see a valid session. This is an optimistic layer only:
 * authorization is enforced by RLS and by server-side checks.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  let env;
  try {
    env = getPublicEnv();
  } catch (error) {
    // Unconfigured deployment: serve pages (and /api/health's diagnosis)
    // instead of failing every request here. Data access still fails loudly.
    console.error(error instanceof Error ? error.message : error);
    return response;
  }

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Responses that set auth cookies must not be cached by CDNs.
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not run code between creating the client and getClaims(): it validates
  // the JWT and triggers the refresh that writes new cookies.
  const { data } = await supabase.auth.getClaims();

  // Optimistic gate for signed-in areas. Pages still verify the session and
  // role themselves (src/lib/auth/session.ts); RLS protects the data.
  const { pathname, search } = request.nextUrl;
  if (!data?.claims?.sub && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
