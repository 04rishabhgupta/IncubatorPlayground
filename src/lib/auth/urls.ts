import { getPublicEnv } from "@/lib/env";

/**
 * Where Supabase email links (signup confirmation, resend, password reset)
 * send people back to. Built from NEXT_PUBLIC_SITE_URL, which must match the
 * Site URL / Redirect URLs in the Supabase dashboard — otherwise Supabase
 * falls back to its Site URL. Without `next`, users land on their role's home.
 */
export function authConfirmUrl(next?: string) {
  const base = `${getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}/auth/confirm`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}
