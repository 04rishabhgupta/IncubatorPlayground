import { z } from "zod";

/** "unknown" clears the stored status, so nothing is claimed. */
export const availabilityChoiceSchema = z.enum(["available", "busy", "unavailable", "unknown"]);
export type AvailabilityChoice = z.infer<typeof availabilityChoiceSchema>;

export const companyAvailabilitySchema = z.object({
  status: availabilityChoiceSchema,
  note: z
    .string()
    .trim()
    .max(280, "Keep the note under 280 characters.")
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export const memberAvailabilitySchema = z.object({
  memberId: z.uuid(),
  status: availabilityChoiceSchema,
});

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const teamMemberSchema = z.object({
  memberId: z.uuid().optional(),
  fullName: z.string().trim().min(1, "Enter a name.").max(120, "Keep the name under 120 characters."),
  jobTitle: z
    .string()
    .trim()
    .max(120, "Keep the title under 120 characters.")
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .pipe(z.email("Enter a valid email address.").max(254).optional()),
  bio: z
    .string()
    .trim()
    .max(1000, "Keep the bio under 1000 characters.")
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  isPublic: checkbox,
  isBookable: checkbox,
});
