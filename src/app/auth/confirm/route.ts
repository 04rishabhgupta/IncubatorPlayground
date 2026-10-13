import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, safeNextPath } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Landing route for Supabase email links (signup confirmation, password
 * recovery). Supports both link styles:
 *   - token_hash + type (custom email template; works on any device)
 *   - code (default PKCE template; must be opened in the browser that signed up)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    // With the default PKCE link, the email is already confirmed even if the
    // code exchange fails (e.g. opened in another browser), so invite sign-in.
    return NextResponse.redirect(new URL("/login?notice=link", request.url));
  }

  let destination = next;
  if (!destination) {
    const { data } = await supabase.auth.getClaims();
    const { data: profile } = data?.claims?.sub
      ? await supabase.from("profiles").select("role").eq("id", data.claims.sub).maybeSingle()
      : { data: null };
    destination = homeForRole(profile?.role ?? "visitor");
  }
  return NextResponse.redirect(new URL(destination, request.url));
}
