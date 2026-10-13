"use client";

import { useActionState } from "react";
import { PasswordFields } from "@/components/auth/password-fields";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePassword } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";

export function PasswordForm() {
  const [state, action] = useActionState(updatePassword, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      <PasswordFields label="New password" errors={state.fieldErrors} />
      <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
    </form>
  );
}
