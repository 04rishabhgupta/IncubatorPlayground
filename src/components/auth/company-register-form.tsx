"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField, SelectField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerCompany } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";
import { PasswordFields } from "./password-fields";

type Industry = { slug: string; name: string };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="font-semibold text-ink" aria-hidden="true">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

export function CompanyRegisterForm({ industries }: { industries: Industry[] }) {
  const [state, action] = useActionState(registerCompany, initialFormState);
  const v = state.values;
  const e = state.fieldErrors;

  // React resets the form after each action; a <select> falls back to its
  // first option rather than the new defaultValue, so restore the choice.
  const industryRef = useRef<HTMLSelectElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (industryRef.current && state.values?.industry !== undefined) {
      industryRef.current.value = state.values.industry;
    }
    // Long form: bring the first problem into view instead of leaving the user at the bottom.
    if (state.status === "error") {
      const target =
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        formRef.current?.querySelector<HTMLElement>('[role="alert"]');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-6" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {state.status === "error" && !state.message && (
        <Alert tone="error">Please correct the highlighted fields.</Alert>
      )}

      <Section
        title="Account"
        description="One sign-in per company, managed by its authorised representative."
      >
        <InputField
          name="fullName"
          label="Representative's full name"
          autoComplete="name"
          defaultValue={v?.fullName}
          errors={e?.fullName}
        />
        <InputField
          name="email"
          type="email"
          label="Business email"
          autoComplete="email"
          hint="Used to sign in and shown on your public profile."
          defaultValue={v?.email}
          errors={e?.email}
        />
        <PasswordFields errors={e} />
      </Section>

      <Section title="Company">
        <InputField
          name="companyName"
          label="Company name"
          defaultValue={v?.companyName}
          errors={e?.companyName}
        />
        <SelectField
          ref={industryRef}
          name="industry"
          label="Industry"
          placeholder="Select an industry"
          options={industries.map((i) => ({ value: i.slug, label: i.name }))}
          defaultValue={v?.industry ?? ""}
          errors={e?.industry}
        />
        <InputField
          name="tagline"
          label="Tagline"
          optional
          maxLength={160}
          placeholder="One line about what you do"
          defaultValue={v?.tagline}
          errors={e?.tagline}
        />
        <TextareaField
          name="description"
          label="Description"
          rows={5}
          maxLength={5000}
          hint="What the company does, its products and services."
          defaultValue={v?.description}
          errors={e?.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            name="website"
            type="url"
            label="Website"
            optional
            placeholder="https://"
            defaultValue={v?.website}
            errors={e?.website}
          />
          <InputField
            name="foundedYear"
            label="Founded year"
            optional
            inputMode="numeric"
            maxLength={4}
            defaultValue={v?.foundedYear}
            errors={e?.foundedYear}
          />
        </div>
        <InputField
          name="phone"
          type="tel"
          label="Contact phone"
          optional
          autoComplete="tel"
          defaultValue={v?.phone}
          errors={e?.phone}
        />
        <TextareaField
          name="officeDetails"
          label="Office information"
          optional
          rows={2}
          maxLength={500}
          hint="Your current or requested office on the floor. The platform admin assigns the final location."
          defaultValue={v?.officeDetails}
          errors={e?.officeDetails}
        />
        <InputField
          name="logo"
          type="file"
          label="Logo"
          optional
          accept="image/png,image/jpeg,image/webp"
          hint="PNG, JPEG or WebP, up to 2 MB. Re-select the file if the form shows an error."
          errors={e?.logo}
        />
      </Section>

      <Alert tone="info">
        New companies are reviewed by the platform admin and appear in the directory once approved.
      </Alert>
      <SubmitButton className="w-full" pendingLabel="Submitting registration…">
        Submit registration
      </SubmitButton>
    </form>
  );
}
