import { describe, expect, it } from "vitest";
import { homeForRole, isProtectedPath, safeNextPath } from "@/lib/auth/roles";
import { checkLogoFile } from "@/lib/files";
import { companyRegistrationSchema, passwordSchema, visitorRegistrationSchema } from "@/lib/validation/auth";

describe("safeNextPath", () => {
  it.each(["/company", "/settings/password?x=1", "/a#b"])("accepts %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "company",
    "",
    "/\u0000x",
    null,
    42,
  ])("rejects %s", (path) => {
    expect(safeNextPath(path)).toBeNull();
  });
});

describe("roles", () => {
  it("routes each role to its home", () => {
    expect(homeForRole("visitor")).toBe("/account");
    expect(homeForRole("company")).toBe("/company");
    expect(homeForRole("super_admin")).toBe("/admin");
  });

  it("detects protected paths without prefix false-positives", () => {
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/settings/password")).toBe(true);
    expect(isProtectedPath("/administrator")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
  });
});

describe("password policy", () => {
  it.each(["Abcdefg1", "Str0ngPassword"])("accepts %s", (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(true);
  });
  it.each(["short1A", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"])("rejects %s", (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});

describe("registration schemas", () => {
  it("normalises visitor email and requires matching passwords", () => {
    const ok = visitorRegistrationSchema.safeParse({
      fullName: " Vera ",
      email: " Vera@Example.COM ",
      password: "Abcdefg1",
      confirmPassword: "Abcdefg1",
    });
    expect(ok.success && ok.data.email).toBe("vera@example.com");

    const mismatch = visitorRegistrationSchema.safeParse({
      fullName: "Vera",
      email: "vera@example.com",
      password: "Abcdefg1",
      confirmPassword: "Abcdefg2",
    });
    expect(mismatch.success).toBe(false);
  });

  const company = {
    fullName: "Rahul Rep",
    email: "contact@acme.example",
    password: "Abcdefg1",
    confirmPassword: "Abcdefg1",
    companyName: "Acme",
    industry: "saas",
    tagline: "",
    description: "We build lab automation robots for research labs.",
    website: "",
    phone: "",
    officeDetails: "",
    foundedYear: "",
  };

  it("turns blank optional company fields into undefined", () => {
    const parsed = companyRegistrationSchema.parse(company);
    expect(parsed).toMatchObject({
      tagline: undefined,
      website: undefined,
      phone: undefined,
      foundedYear: undefined,
    });
  });

  it.each([
    ["website", "javascript:alert(1)"],
    ["website", "acme.example"],
    ["foundedYear", "1700"],
    ["foundedYear", String(new Date().getFullYear() + 1)],
    ["phone", "call me"],
    ["description", "too short"],
  ])("rejects invalid %s %s", (field, value) => {
    const result = companyRegistrationSchema.safeParse({ ...company, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe(field);
  });
});

describe("checkLogoFile", () => {
  const file = (bytes: number[], size = bytes.length, type = "image/png") => {
    const data = new Uint8Array(size);
    data.set(bytes);
    return new File([data], "logo", { type });
  };

  it("identifies PNG, JPEG and WebP by content", async () => {
    expect(await checkLogoFile(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toMatchObject({
      ok: true,
      ext: "png",
    });
    expect(await checkLogoFile(file([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ ok: true, ext: "jpg" });
    const webp = [..."RIFF"]
      .map((c) => c.charCodeAt(0))
      .concat(
        [0, 0, 0, 0],
        [..."WEBP"].map((c) => c.charCodeAt(0)),
      );
    expect(await checkLogoFile(file(webp))).toMatchObject({ ok: true, ext: "webp" });
  });

  it("rejects disguised, empty and oversized files", async () => {
    const svg = [...'<svg xmlns="'].map((c) => c.charCodeAt(0));
    expect((await checkLogoFile(file(svg, svg.length, "image/png"))).ok).toBe(false);
    expect((await checkLogoFile(file([], 0))).ok).toBe(false);
    expect((await checkLogoFile(file([0x89, 0x50, 0x4e, 0x47], 2 * 1024 * 1024 + 1))).ok).toBe(false);
  });
});
