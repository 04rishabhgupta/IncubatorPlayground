import type { Enums } from "@/types/database";

export type AppRole = Enums<"app_role">;

export const roleLabels: Record<AppRole, string> = {
  visitor: "Visitor",
  company: "Company",
  super_admin: "Super admin",
};

/** Landing page for each role after sign-in. */
export function homeForRole(role: AppRole): string {
  switch (role) {
    case "super_admin":
      return "/admin";
    case "company":
      return "/company";
    default:
      return "/account";
  }
}

/** Paths that require a signed-in user (checked optimistically in the proxy). */
export const protectedPrefixes = ["/account", "/company", "/admin", "/settings", "/notifications"] as const;

export function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Accepts only same-origin relative paths for post-login redirects, so a
 * crafted `?next=` cannot send users to another site.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
