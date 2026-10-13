import { z } from "zod";

/** Mirrors the Supabase Auth password policy (min 8; lower, upper, digit). */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.");

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));

const optionalText = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .max(max, message ?? `Keep this under ${max} characters.`)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const visitorRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const currentYear = new Date().getFullYear();

export const companyRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the representative's full name.").max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    companyName: z.string().trim().min(2, "Enter the company name.").max(120),
    industry: z.string().trim().min(1, "Choose an industry.").max(80),
    tagline: optionalText(160),
    description: z
      .string()
      .trim()
      .min(20, "Describe the company in at least 20 characters.")
      .max(5000, "Keep the description under 5000 characters."),
    website: z
      .string()
      .trim()
      .max(300)
      .transform((value) => (value === "" ? undefined : value))
      .optional()
      .refine((value) => value === undefined || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value), {
        message: "Enter a full URL starting with https://",
      }),
    phone: optionalText(32).refine((value) => value === undefined || /^[+()\-\s0-9]{6,32}$/.test(value), {
      message: "Enter a valid phone number.",
    }),
    officeDetails: optionalText(500),
    foundedYear: z
      .string()
      .trim()
      .transform((value) => (value === "" ? undefined : value))
      .optional()
      .refine(
        (value) => value === undefined || (/^\d{4}$/.test(value) && +value >= 1800 && +value <= currentYear),
        {
          message: `Enter a year between 1800 and ${currentYear}.`,
        },
      ),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: optionalText(32).refine((value) => value === undefined || /^[+()\-\s0-9]{6,32}$/.test(value), {
    message: "Enter a valid phone number.",
  }),
});

/** Logo constraints; must match the company-logos storage bucket. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
