"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { setCompanyAvailability } from "@/lib/availability/actions";
import { cn } from "@/lib/cn";
import type { AvailabilityStatus } from "@/lib/companies/queries";
import { initialFormState } from "@/lib/forms";

export const availabilityOptions = [
  { value: "available", label: "Available", dot: "bg-status-available" },
  { value: "busy", label: "Busy", dot: "bg-status-busy" },
  { value: "unavailable", label: "Unavailable", dot: "bg-status-unavailable" },
  { value: "unknown", label: "Unknown", dot: "bg-status-unknown" },
] as const;

/** Company-level availability: four choices (real radio buttons) plus an optional note. */
export function CompanyAvailabilityForm({
  current,
}: {
  current: { status: AvailabilityStatus; note: string | null } | null;
}) {
  const [state, action] = useActionState(setCompanyAvailability, initialFormState);
  const selected = state.values?.status ?? current?.status ?? "unknown";
  const note = state.values?.note ?? current?.note ?? "";

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Company status</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {availabilityOptions.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                "has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:font-medium",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
                "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="status"
                value={option.value}
                defaultChecked={selected === option.value}
                className="sr-only"
              />
              <span className={cn("size-2.5 rounded-full", option.dot)} aria-hidden="true" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <InputField
        name="note"
        label="Note for visitors"
        optional
        maxLength={280}
        placeholder="e.g. Back at 3 pm"
        defaultValue={note}
        errors={state.fieldErrors?.note}
        hint="Choose Unknown if you don't want to show a status."
      />
      <SubmitButton pendingLabel="Saving…">Update availability</SubmitButton>
    </form>
  );
}
