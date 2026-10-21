import { z } from "zod";

/** Chat messages and the email contact form (Phase 7). */

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(4000, "Keep messages under 4000 characters.");

export const contactFormSchema = z.object({
  companyId: z.uuid(),
  name: z.string().trim().min(1, "Enter your name.").max(120, "Keep your name under 120 characters."),
  subject: z.string().trim().min(1, "Enter a subject.").max(150, "Keep the subject under 150 characters."),
  body: z
    .string()
    .trim()
    .min(10, "Write at least a sentence (10 characters).")
    .max(5000, "Keep the message under 5000 characters."),
  // Hidden from people; bots fill it in.
  website: z.string().max(0, "Spam check failed.").optional().default(""),
});
