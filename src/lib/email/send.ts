import "server-only";
import { getEmailEnv } from "@/lib/env.server";
import type { EmailContent } from "./templates";

export type SendResult =
  { status: "sent" } | { status: "not_configured" } | { status: "failed"; error: string };

/**
 * Sends one email through Resend's REST API. Never throws: email is a
 * courtesy copy, so a missing configuration or a provider error is reported
 * to the caller (and logged) instead of breaking the action that triggered it.
 */
export async function sendEmail(
  to: string,
  content: EmailContent,
  { replyTo }: { replyTo?: string } = {},
): Promise<SendResult> {
  let env;
  try {
    env = getEmailEnv();
  } catch {
    return { status: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: content.subject,
        text: content.text,
        html: content.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      console.error("Email failed", response.status, detail);
      return { status: "failed", error: `Provider returned ${response.status}` };
    }
    return { status: "sent" };
  } catch (error) {
    console.error("Email failed", error);
    return { status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}
