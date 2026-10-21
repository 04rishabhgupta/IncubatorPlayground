import { z } from "zod";
import { availabilityChoiceSchema } from "./team";

/** Admin forms for the FITT Incubation Team and announcements (Phase 4R.5). */

const blank = (v: string) => (v === "" ? undefined : v);
const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).transform(blank).optional();

export const staffMemberSchema = z.object({
  staffId: z.uuid().optional(),
  fullName: z.string().trim().min(1, "Enter a name.").max(120, "Keep the name under 120 characters."),
  jobTitle: optionalText(120, "Keep the role under 120 characters."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform(blank)
    .optional()
    .pipe(z.email("Enter a valid email address.").max(254).optional()),
  phone: optionalText(32, "Enter a valid phone number.").refine(
    (v) => v === undefined || /^[+()\-\s0-9]{6,32}$/.test(v),
    { message: "Enter a valid phone number." },
  ),
  availability: availabilityChoiceSchema,
  isPublic: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  sortOrder: z
    .string()
    .trim()
    .transform(blank)
    .optional()
    .refine((v) => v === undefined || /^-?\d{1,4}$/.test(v), { message: "Enter a whole number." }),
});

/** A datetime-local value ("2026-10-21T16:00") split into the building's wall date and time. */
const wallDateTime = z
  .string()
  .trim()
  .transform(blank)
  .optional()
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), {
    message: "Enter a date and time.",
  })
  .transform((v) => (v ? { date: v.slice(0, 10), time: v.slice(11, 16) } : undefined));

export const announcementSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
  body: optionalText(1000, "Keep the message under 1000 characters."),
  floorId: z.union([z.literal("all"), z.uuid("Choose a floor.")]),
  startsAt: wallDateTime,
  endsAt: wallDateTime,
});
