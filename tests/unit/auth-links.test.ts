import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verifies the exact redirect URLs the auth Server Actions hand to Supabase
 * for signup confirmation, resend confirmation and password reset. The
 * Supabase client is replaced by a recorder; the actions themselves are real.
 */

const calls: Array<{ method: string; options: Record<string, unknown> | undefined }> = [];

const fakeSupabase = {
  auth: {
    signUp: vi.fn(async (args: { options?: Record<string, unknown> }) => {
      calls.push({ method: "signUp", options: args.options });
      return { data: { user: { id: "u1", identities: [{}] }, session: null }, error: null };
    }),
    resend: vi.fn(async (args: { options?: Record<string, unknown> }) => {
      calls.push({ method: "resend", options: args.options });
      return { data: {}, error: null };
    }),
    resetPasswordForEmail: vi.fn(async (_email: string, options?: Record<string, unknown>) => {
      calls.push({ method: "resetPasswordForEmail", options });
      return { data: {}, error: null };
    }),
  },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "saas" } }) }) }),
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

async function run(action: () => Promise<unknown>) {
  try {
    return await action();
  } catch (error) {
    if ((error as Error).message !== "NEXT_REDIRECT") throw error;
    return { redirected: (error as { url: string }).url };
  }
}

const idle = { status: "idle" as const };

beforeEach(() => {
  calls.length = 0;
  vi.resetModules();
});
afterEach(() => vi.unstubAllEnvs());

describe("authConfirmUrl", () => {
  it("builds links from NEXT_PUBLIC_SITE_URL and tolerates a trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001/");
    const { authConfirmUrl } = await import("@/lib/auth/urls");
    expect(authConfirmUrl()).toBe("http://localhost:3001/auth/confirm");
    expect(authConfirmUrl("/settings/password")).toBe(
      "http://localhost:3001/auth/confirm?next=%2Fsettings%2Fpassword",
    );
  });

  it("defaults to port 3001 when NEXT_PUBLIC_SITE_URL is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const { authConfirmUrl } = await import("@/lib/auth/urls");
    expect(authConfirmUrl()).toBe("http://localhost:3001/auth/confirm");
  });
});

describe("auth emails point at the Startup Floor Connect site", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
  });

  it("visitor signup confirmation → /account", async () => {
    const { registerVisitor } = await import("@/lib/auth/actions");
    const result = await run(() =>
      registerVisitor(
        idle,
        form({
          fullName: "Vera",
          email: "vera@example.dev",
          password: "Abcdefg1",
          confirmPassword: "Abcdefg1",
        }),
      ),
    );
    expect(result).toEqual({ redirected: "/check-email" });
    expect(calls).toEqual([
      {
        method: "signUp",
        options: expect.objectContaining({
          emailRedirectTo: "http://localhost:3001/auth/confirm?next=%2Faccount",
        }),
      },
    ]);
  });

  it("company signup confirmation → /company", async () => {
    const { registerCompany } = await import("@/lib/auth/actions");
    const result = await run(() =>
      registerCompany(
        idle,
        form({
          fullName: "Rita Rep",
          email: "rita@startup.dev",
          password: "Abcdefg1",
          confirmPassword: "Abcdefg1",
          companyName: "Nimbus Labs",
          industry: "saas",
          description: "A company that builds things for other companies.",
          tagline: "",
          website: "",
          phone: "",
          officeDetails: "",
          foundedYear: "",
        }),
      ),
    );
    expect(result).toEqual({ redirected: "/check-email" });
    expect(calls[0]).toEqual({
      method: "signUp",
      options: expect.objectContaining({
        emailRedirectTo: "http://localhost:3001/auth/confirm?next=%2Fcompany",
      }),
    });
  });

  it("resend confirmation → role home", async () => {
    const { resendConfirmation } = await import("@/lib/auth/actions");
    await run(() => resendConfirmation(idle, form({ email: "vera@example.dev" })));
    expect(calls).toEqual([
      { method: "resend", options: { emailRedirectTo: "http://localhost:3001/auth/confirm" } },
    ]);
  });

  it("password reset → /settings/password", async () => {
    const { requestPasswordReset } = await import("@/lib/auth/actions");
    await run(() => requestPasswordReset(idle, form({ email: "vera@example.dev" })));
    expect(calls).toEqual([
      {
        method: "resetPasswordForEmail",
        options: { redirectTo: "http://localhost:3001/auth/confirm?next=%2Fsettings%2Fpassword" },
      },
    ]);
  });
});
