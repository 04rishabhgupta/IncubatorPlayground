"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateProfile } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";

export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  const [state, action] = useActionState(updateProfile, initialFormState);
  const values = state.values;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ink">Email</p>
        <p className="text-sm text-muted">{email}</p>
      </div>
      <InputField
        name="fullName"
        label="Full name"
        autoComplete="name"
        defaultValue={values?.fullName ?? fullName}
        errors={state.fieldErrors?.fullName}
      />
      <InputField
        name="phone"
        type="tel"
        label="Phone"
        optional
        autoComplete="tel"
        defaultValue={values?.phone ?? phone}
        errors={state.fieldErrors?.phone}
      />
      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}
