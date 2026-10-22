"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const roleChangeSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["visitor", "super_admin"]),
});

/**
 * Change a user's role (super admins only). The database allows only changes
 * that keep accounts working — visitor ↔ super admin, never your own role,
 * never the last admin — and notifies the user; these checks just explain.
 */
export async function changeUserRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (session?.profile.role !== "super_admin") {
    return { status: "error", message: "Only the platform admin can change roles." };
  }
  const parsed = roleChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Choose a valid role." };
  if (parsed.data.userId === session.userId) {
    return { status: "error", message: "You can't change your own role. Ask another admin." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId)
    .select("email, role")
    .maybeSingle();

  if (error || !data) {
    const message = error?.message ?? "";
    const known = [/stays a company account/, /registering a company/, /last super admin/, /their own role/];
    if (!known.some((re) => re.test(message))) console.error("Role change failed", error);
    return {
      status: "error",
      message: known.some((re) => re.test(message))
        ? `${message.replace(/^./, (c) => c.toUpperCase())}.`
        : "The role couldn't be changed. Please try again.",
    };
  }
  revalidatePath("/admin/users");
  return {
    status: "success",
    message:
      data.role === "super_admin"
        ? `${data.email} is now a platform admin.`
        : `${data.email} is now a visitor account.`,
  };
}
