"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { signIn } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <InputField
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <InputField
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        errors={state.fieldErrors?.password}
      />
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">
          Forgot password?
        </Link>
        <Link href="/check-email" className="text-muted hover:text-ink hover:underline">
          Resend confirmation
        </Link>
      </div>
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
