"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerVisitor } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";
import { PasswordFields } from "./password-fields";

export function VisitorRegisterForm() {
  const [state, action] = useActionState(registerVisitor, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <InputField
        name="fullName"
        label="Full name"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        errors={state.fieldErrors?.fullName}
      />
      <InputField
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <PasswordFields errors={state.fieldErrors} />
      <SubmitButton className="w-full" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
