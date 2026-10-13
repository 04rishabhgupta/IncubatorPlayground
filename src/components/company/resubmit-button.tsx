"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { resubmitRegistration } from "@/lib/companies/actions";
import { initialFormState } from "@/lib/forms";

export function ResubmitButton() {
  const [state, action] = useActionState(resubmitRegistration, initialFormState);
  return (
    <form action={action} className="space-y-3">
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      <SubmitButton pendingLabel="Resubmitting…">Resubmit for review</SubmitButton>
    </form>
  );
}
