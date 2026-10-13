import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { homeForRole, type AppRole } from "./roles";

export type SessionProfile = Pick<
  Tables<"profiles">,
  "id" | "email" | "full_name" | "phone" | "avatar_url" | "role"
>;

export type Session = { userId: string; profile: SessionProfile };

/**
 * Data Access Layer entry point. Verifies the Supabase JWT (getClaims) and
 * loads the caller's profile, memoised per request. Returns null for guests.
 * Reads cookies, so callers must render inside <Suspense> (or a loading.tsx).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  // Session checks are per-request. Without this, prerendering/prefetching
  // runs supabase-js (which reads the clock to validate the JWT) ahead of a
  // real request, which Cache Components rejects.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, avatar_url, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return { userId, profile };
});

/** Require a signed-in user; otherwise redirect to login and come back afterwards. */
export async function requireSession(returnTo: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}

/** Require one of the given roles; other signed-in users go to their own home. */
export async function requireRole(roles: AppRole[], returnTo: string): Promise<Session> {
  const session = await requireSession(returnTo);
  if (!roles.includes(session.profile.role)) redirect(homeForRole(session.profile.role));
  return session;
}
