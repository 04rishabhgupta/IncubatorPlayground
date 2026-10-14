import { z } from "zod";

/**
 * Public (browser-safe) configuration. NEXT_PUBLIC_* values are inlined at
 * build time, so each must be referenced by its full literal name.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3001"),
  NEXT_PUBLIC_DEFAULT_TIMEZONE: z.string().min(1).default("Asia/Kolkata"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_DEFAULT_TIMEZONE: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || undefined,
  });
  if (!parsed.success) {
    throw new Error(formatEnvError("public", parsed.error));
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

export function formatEnvError(kind: string, error: z.ZodError) {
  const fields = error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  return `Invalid ${kind} environment variables (see .env.example):\n${fields.join("\n")}`;
}
