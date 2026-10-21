"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendContactMessage } from "@/lib/companies/contact-actions";
import { initialFormState } from "@/lib/forms";

/** Email the company (signed-in users). The reply goes to the sender's account email. */
export function ContactForm({
  companyId,
  companyName,
  defaultName,
  email,
}: {
  companyId: string;
  companyName: string;
  defaultName: string;
  email: string;
}) {
  const [state, action] = useActionState(sendContactMessage, initialFormState);
  const v = state.status === "error" ? state.values : undefined;
  const e = state.fieldErrors;
  return (
    <form
      action={action}
      key={state.status === "success" ? state.message : undefined}
      className="space-y-3"
      noValidate
    >
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      <input type="hidden" name="companyId" value={companyId} />
      {/* Spam trap: invisible to people, tempting to bots. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <InputField
        id="contact-name"
        name="name"
        label="Your name"
        maxLength={120}
        defaultValue={v?.name ?? defaultName}
        errors={e?.name}
      />
      <InputField
        id="contact-subject"
        name="subject"
        label="Subject"
        maxLength={150}
        defaultValue={v?.subject}
        errors={e?.subject}
      />
      <TextareaField
        id="contact-body"
        name="body"
        label="Message"
        rows={5}
        maxLength={5000}
        defaultValue={v?.body}
        errors={e?.body}
      />
      <p className="text-xs text-muted">
        {companyName} will reply to <span className="font-medium text-ink">{email}</span>. Up to 3 messages an
        hour.
      </p>
      <SubmitButton pendingLabel="Sending…">Send email</SubmitButton>
    </form>
  );
}
