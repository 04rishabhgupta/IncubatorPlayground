import { afterEach, describe, expect, it, vi } from "vitest";

describe("getPublicEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports every missing variable by name", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { getPublicEnv } = await import("@/lib/env");
    expect(() => getPublicEnv()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("applies defaults for optional values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_TIMEZONE", "");
    const { getPublicEnv } = await import("@/lib/env");
    expect(getPublicEnv()).toMatchObject({
      NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
      NEXT_PUBLIC_DEFAULT_TIMEZONE: "Asia/Kolkata",
    });
  });
});
