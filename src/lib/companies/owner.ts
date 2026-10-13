import "server-only";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the signed-in company account's own company for Server Actions,
 * or a user-facing reason why not. RLS still applies to every query made with
 * the returned client; this is the friendly, early check.
 */
export async function ownCompany() {
  const session = await getSession();
  if (!session) return { error: "Your session has expired. Please sign in again." } as const;
  if (session.profile.role !== "company") return { error: "Only company accounts can do this." } as const;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, slug, logo_path, status")
    .eq("owner_id", session.userId)
    .maybeSingle();
  if (!company) return { error: "No company is linked to this account." } as const;
  return { supabase, company, userId: session.userId } as const;
}

/** Pages that show a company's public data. */
export function revalidateCompany(slug: string) {
  revalidatePath("/company", "layout");
  revalidatePath("/directory");
  revalidatePath(`/companies/${slug}`);
  revalidatePath("/");
}
