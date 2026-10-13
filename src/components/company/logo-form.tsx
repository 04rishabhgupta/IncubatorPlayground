"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeCompanyLogo, uploadCompanyLogo } from "@/lib/companies/actions";
import { initialFormState, type FormState } from "@/lib/forms";

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

export function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [uploadState, upload] = useActionState(uploadCompanyLogo, initialFormState);
  const [removeState, remove] = useActionState(removeCompanyLogo, initialFormState);

  return (
    <div className="space-y-4">
      <form action={upload} className="space-y-4" noValidate>
        <Message state={uploadState} />
        <InputField
          name="logo"
          type="file"
          label="Upload a new logo"
          accept="image/png,image/jpeg,image/webp"
          hint="PNG, JPEG or WebP, up to 2 MB. Square images look best."
          errors={uploadState.fieldErrors?.logo}
        />
        <SubmitButton pendingLabel="Uploading…">Upload logo</SubmitButton>
      </form>
      {hasLogo && (
        <form action={remove} className="space-y-3 border-t border-border pt-4">
          <Message state={removeState} />
          <SubmitButton pendingLabel="Removing…" variant="secondary">
            Remove logo
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
