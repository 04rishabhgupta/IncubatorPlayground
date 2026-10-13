import { z } from "zod";
import { BOOKING_RULES } from "@/lib/appointments/rules";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const bookingSchema = z.object({
  companySlug: z.string().min(1).max(80),
  memberId: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .pipe(z.uuid("Choose a representative.").optional()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time."),
  duration: z.coerce
    .number("Choose a duration.")
    .refine((v) => (BOOKING_RULES.durations as readonly number[]).includes(v), "Choose a duration."),
  meetingType: z.enum(["in_person", "online"], "Choose in person or online."),
  purpose: z
    .string()
    .trim()
    .min(10, "Tell the company what you'd like to discuss (at least 10 characters).")
    .max(2000, "Keep the purpose under 2000 characters."),
});

export const responseSchema = z
  .object({
    appointmentId: z.uuid(),
    decision: z.enum(["accept", "reject"]),
    note: optionalText(1000, "Keep the note under 1000 characters."),
    meetingLink: z
      .string()
      .trim()
      .transform((v) => (v === "" ? undefined : v))
      .optional()
      .refine(
        (v) => v === undefined || /^https:\/\/\S+\.\S+/i.test(v),
        "Enter a link starting with https://",
      ),
    locationNote: optionalText(300, "Keep the location under 300 characters."),
    meetingType: z.enum(["in_person", "online"]),
  })
  .refine((d) => !(d.decision === "accept" && d.meetingType === "online" && !d.meetingLink), {
    path: ["meetingLink"],
    message: "Add the meeting link for an online appointment.",
  });

export const cancelSchema = z.object({
  appointmentId: z.uuid(),
  note: optionalText(1000, "Keep the note under 1000 characters."),
});
