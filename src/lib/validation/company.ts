import { z } from "zod";

const currentYear = new Date().getFullYear();

const blankToUndefined = (value: string) => (value === "" ? undefined : value);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters.`).transform(blankToUndefined).optional();

/** One service per line (or comma separated); trimmed, de-duplicated. */
export const servicesSchema = z
  .string()
  .max(4000)
  .transform((value) =>
    Array.from(
      new Set(
        value
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ),
  )
  .pipe(
    z
      .array(z.string().max(80, "Keep each service under 80 characters."))
      .max(30, "List at most 30 services."),
  );

export const websiteSchema = z
  .string()
  .trim()
  .max(300)
  .transform(blankToUndefined)
  .optional()
  .refine((value) => value === undefined || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value), {
    message: "Enter a full URL starting with https://",
  });

export const phoneSchema = optionalText(32).refine(
  (value) => value === undefined || /^[+()\-\s0-9]{6,32}$/.test(value),
  { message: "Enter a valid phone number." },
);

export const foundedYearSchema = z
  .string()
  .trim()
  .transform(blankToUndefined)
  .optional()
  .refine(
    (value) => value === undefined || (/^\d{4}$/.test(value) && +value >= 1800 && +value <= currentYear),
    { message: `Enter a year between 1800 and ${currentYear}.` },
  );

export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  industry: z.string().trim().min(1, "Choose an industry.").max(80),
  tagline: optionalText(160),
  description: z
    .string()
    .trim()
    .min(20, "Describe the company in at least 20 characters.")
    .max(5000, "Keep the description under 5000 characters."),
  services: servicesSchema,
  website: websiteSchema,
  businessEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  phone: phoneSchema,
  officeDetails: optionalText(500),
  foundedYear: foundedYearSchema,
});

export const reviewDecisionSchema = z
  .object({
    companyId: z.uuid(),
    decision: z.enum(["approve", "reject", "suspend", "reinstate"]),
    reason: z.string().trim().max(1000, "Keep the reason under 1000 characters.").optional().default(""),
  })
  .refine((data) => !["reject", "suspend"].includes(data.decision) || data.reason.length >= 5, {
    path: ["reason"],
    message: "Give the company a reason (at least 5 characters).",
  });

export type ReviewDecision = z.infer<typeof reviewDecisionSchema>["decision"];
