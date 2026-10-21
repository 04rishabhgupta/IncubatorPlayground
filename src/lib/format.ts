import { getPublicEnv } from "@/lib/env";

/**
 * Deterministic date formatting in the platform timezone (no "x minutes ago",
 * which would depend on the current time during rendering).
 */
export function formatDate(value: string | Date, style: "date" | "datetime" | "time" = "date") {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: getPublicEnv().NEXT_PUBLIC_DEFAULT_TIMEZONE,
    ...(style === "time" ? { timeStyle: "short" } : { dateStyle: "medium" }),
    ...(style === "datetime" ? { timeStyle: "short" } : {}),
  }).format(date);
}

/** Public URL of an object in a public Storage bucket. */
export function publicStorageUrl(bucket: "company-logos" | "team-avatars", path: string | null | undefined) {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${getPublicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encoded}`;
}

/** Display form of a website URL: no protocol, no trailing slash. */
export function displayUrl(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
