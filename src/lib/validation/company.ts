import { z } from "zod";
import { STARTUP_STAGES } from "@/lib/companies/startup";

const currentYear = new Date().getFullYear();

const blankToUndefined = (value: string) => (value === "" ? undefined : value);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters.`).transform(blankToUndefined).optional();

/** A list typed one per line (or comma separated); trimmed, de-duplicated. */
const labelListSchema = (noun: string, maxItems: number, maxLength: number) =>
  z
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
        .array(z.string().max(maxLength, `Keep each ${noun} under ${maxLength} characters.`))
        .max(maxItems, `List at most ${maxItems} ${noun === "technology" ? "technologies" : `${noun}s`}.`),
    );

export const servicesSchema = labelListSchema("service", 30, 80);
export const techStackSchema = labelListSchema("technology", 20, 40);

export const stageSchema = z
  .union([z.enum(STARTUP_STAGES.map((s) => s.value) as [string, ...string[]]), z.literal("")])
  .optional()
  .transform((value) => (value ? (value as (typeof STARTUP_STAGES)[number]["value"]) : undefined));

export const teamSizeSchema = z
  .string()
  .trim()
  .transform(blankToUndefined)
  .optional()
  .refine((value) => value === undefined || (/^\d{1,6}$/.test(value) && +value >= 1 && +value <= 100000), {
    message: "Enter the number of people, e.g. 8.",
  });

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
  stage: stageSchema,
  teamSize: teamSizeSchema,
  techStack: techStackSchema.optional().default([]),
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
