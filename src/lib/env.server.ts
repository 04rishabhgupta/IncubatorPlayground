import "server-only";
import { z } from "zod";
import { formatEnvError } from "./env";

/**
 * Server-only secrets. Importing this module from a Client Component fails
 * the build (via "server-only"), so these values can never reach the browser.
 * Each getter validates only what its feature needs, so an unconfigured
 * optional integration (e.g. email) does not break unrelated pages.
 */
const supabaseSecretSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const emailSchema = z.object({
  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),
});

export function getSupabaseSecretKey() {
  const parsed = supabaseSecretSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  if (!parsed.success) throw new Error(formatEnvError("server", parsed.error));
  return parsed.data.SUPABASE_SECRET_KEY;
}

export function getEmailEnv() {
  const parsed = emailSchema.safeParse({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  });
  if (!parsed.success) throw new Error(formatEnvError("email", parsed.error));
  return parsed.data;
}
