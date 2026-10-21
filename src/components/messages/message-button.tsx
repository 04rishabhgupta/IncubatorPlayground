"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { startConversation } from "@/lib/messages/actions";

/**
 * "Message this company": opens (or reuses) the conversation. Guests are sent
 * to sign in and come back to `returnTo`.
 */
export function MessageButton({
  companyId,
  companyName,
  returnTo,
  variant = "secondary",
  className,
}: {
  companyId: string;
  companyName: string;
  returnTo: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [state, action] = useActionState(startConversation, initialFormState);
  return (
    <form action={action} className={className}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton variant={variant} pendingLabel="Opening chat…" className="w-full">
        Message {companyName}
      </SubmitButton>
      {state.status === "error" && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
