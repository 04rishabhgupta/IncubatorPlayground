"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField, SelectField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateCompanyProfile } from "@/lib/companies/actions";
import { initialFormState } from "@/lib/forms";

export type CompanyProfileDefaults = {
  name: string;
  industry: string;
  tagline: string;
  description: string;
  services: string;
  website: string;
  businessEmail: string;
  phone: string;
  officeDetails: string;
  foundedYear: string;
};

export function CompanyProfileForm({
  defaults,
  industries,
}: {
  defaults: CompanyProfileDefaults;
  industries: Array<{ slug: string; name: string }>;
}) {
  const [state, action] = useActionState(updateCompanyProfile, initialFormState);
  const v = { ...defaults, ...state.values };
  const e = state.fieldErrors;

  // React resets forms after an action; keep the select on the submitted value
  // and bring the first error into view.
  const formRef = useRef<HTMLFormElement>(null);
  const industryRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (industryRef.current && state.values?.industry !== undefined)
      industryRef.current.value = state.values.industry;
    if (state.status !== "idle") {
      const target =
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        formRef.current?.querySelector<HTMLElement>('[role="alert"], [role="status"]');
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target?.matches("input, textarea, select")) target.focus({ preventScroll: true });
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      <InputField name="name" label="Company name" defaultValue={v.name} errors={e?.name} />
      <SelectField
        ref={industryRef}
        name="industry"
        label="Industry"
        placeholder="Select an industry"
        options={industries.map((i) => ({ value: i.slug, label: i.name }))}
        defaultValue={v.industry}
        errors={e?.industry}
      />
      <InputField
        name="tagline"
        label="Tagline"
        optional
        maxLength={160}
        defaultValue={v.tagline}
        errors={e?.tagline}
      />
      <TextareaField
        name="description"
        label="Description"
        rows={6}
        maxLength={5000}
        defaultValue={v.description}
        errors={e?.description}
      />
      <TextareaField
        name="services"
        label="Services"
        optional
        rows={4}
        hint="One per line, up to 30."
        defaultValue={v.services}
        errors={e?.services}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          name="businessEmail"
          type="email"
          label="Public contact email"
          defaultValue={v.businessEmail}
          errors={e?.businessEmail}
        />
        <InputField name="phone" type="tel" label="Phone" optional defaultValue={v.phone} errors={e?.phone} />
        <InputField
          name="website"
          type="url"
          label="Website"
          optional
          placeholder="https://"
          defaultValue={v.website}
          errors={e?.website}
        />
        <InputField
          name="foundedYear"
          label="Founded year"
          optional
          inputMode="numeric"
          maxLength={4}
          defaultValue={v.foundedYear}
          errors={e?.foundedYear}
        />
      </div>
      <TextareaField
        name="officeDetails"
        label="Office information"
        optional
        rows={2}
        maxLength={500}
        hint="Only the platform admin assigns your office on the floor map."
        defaultValue={v.officeDetails}
        errors={e?.officeDetails}
      />
      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}
