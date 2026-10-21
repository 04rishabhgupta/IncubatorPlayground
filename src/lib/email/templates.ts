/**
 * Plain-text and HTML bodies for transactional emails. Pure functions, so
 * they can be unit tested; everything users typed is escaped in the HTML.
 */

export type EmailContent = { subject: string; text: string; html: string };

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keep subjects on one line and within mail-client limits. */
const oneLine = (value: string, max = 150) =>
  value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max);

function layout(paragraphs: string[], footer: string) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#121826">` +
    `${body}<p style="margin:24px 0 0;font-size:12px;color:#5b6576">${escapeHtml(footer)}</p></div>`
  );
}

const FOOTER = "Sent by Startup Floor Connect.";

export function contactEmail(input: {
  companyName: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
}): EmailContent {
  const intro = `${input.senderName} (${input.senderEmail}) sent ${input.companyName} a message through your profile on Startup Floor Connect. Reply to this email to answer them directly.`;
  const subject = oneLine(`${input.subject} — via Startup Floor Connect`);
  return {
    subject,
    text: `${intro}\n\nSubject: ${oneLine(input.subject)}\n\n${input.body}\n\n—\n${FOOTER}`,
    html: layout([intro, `Subject: ${oneLine(input.subject)}`, input.body], FOOTER),
  };
}

export type AppointmentEvent = "requested" | "accepted" | "rejected" | "cancelled";

/** An email copy of an appointment notification, with a link back to the app. */
export function appointmentEmail(input: {
  event: AppointmentEvent;
  companyName: string;
  requesterName: string;
  when: string;
  reason?: string | null;
  url: string;
}): EmailContent {
  const lines: Record<AppointmentEvent, { subject: string; lead: string }> = {
    requested: {
      subject: `New appointment request from ${input.requesterName}`,
      lead: `${input.requesterName} asked to meet ${input.companyName} on ${input.when}.`,
    },
    accepted: {
      subject: `${input.companyName} accepted your appointment`,
      lead: `${input.companyName} accepted your appointment on ${input.when}.`,
    },
    rejected: {
      subject: `${input.companyName} declined your appointment`,
      lead: `${input.companyName} declined your appointment request for ${input.when}.`,
    },
    cancelled: {
      subject: `Appointment cancelled: ${input.when}`,
      lead: `The appointment between ${input.requesterName} and ${input.companyName} on ${input.when} was cancelled.`,
    },
  };
  const { subject, lead } = lines[input.event];
  const paragraphs = [
    lead,
    ...(input.reason ? [`Reason: ${input.reason}`] : []),
    `See the details: ${input.url}`,
  ];
  return {
    subject: oneLine(subject),
    text: `${paragraphs.join("\n\n")}\n\n—\n${FOOTER}`,
    html: layout(paragraphs, FOOTER),
  };
}
