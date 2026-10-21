"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveOfficeRequest, withdrawOfficeRequest } from "@/lib/companies/office-request-actions";
import type { OwnOfficeRequest, RequestableOffice } from "@/lib/companies/office-request";
import { formatDate } from "@/lib/format";
import { initialFormState } from "@/lib/forms";

/** Ask the platform admin for an office: one vacant office or any, plus a note. */
export function OfficeRequestForm({
  request,
  offices,
}: {
  request: OwnOfficeRequest | null;
  offices: RequestableOffice[];
}) {
  const [state, action] = useActionState(saveOfficeRequest, initialFormState);
  const [withdrawState, withdraw] = useActionState(withdrawOfficeRequest, initialFormState);
  const requested = request?.space_id ? offices.find((o) => o.id === request.space_id) : undefined;
  // Show only the message that matches the current state: a stale "Request sent"
  // shouldn't sit above a request that has since been withdrawn.
  const result = request ? state : withdrawState.status !== "idle" ? withdrawState : state;

  return (
    <div className="space-y-4">
      {result.message && (
        <Alert tone={result.status === "success" ? "success" : "error"}>{result.message}</Alert>
      )}
      {request && (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
          Requested {formatDate(request.updated_at)}:{" "}
          <span className="font-medium">
            {request.space_id
              ? requested
                ? `${requested.label} (${requested.floor})`
                : "an office that is no longer vacant"
              : "any office"}
          </span>
          {request.note && <span className="block text-muted">“{request.note}”</span>}
        </p>
      )}

      <form action={action} className="space-y-3" noValidate>
        <SelectField
          id="office-request-space"
          name="spaceId"
          label={request ? "Change your request" : "Preferred office"}
          options={[
            { value: "any", label: "Any vacant office" },
            ...offices.map((o) => ({ value: o.id, label: `${o.label} · ${o.floor}` })),
          ]}
          defaultValue={state.values?.spaceId ?? request?.space_id ?? "any"}
          errors={state.fieldErrors?.spaceId}
        />
        <TextareaField
          id="office-request-note"
          name="note"
          label="Note for the admin"
          optional
          rows={2}
          maxLength={500}
          hint="For example how many people need desks, or when you'd like to move in."
          defaultValue={state.values?.note ?? request?.note ?? ""}
          errors={state.fieldErrors?.note}
        />
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Sending…">{request ? "Update request" : "Request office"}</SubmitButton>
        </div>
      </form>
      {request && (
        <form action={withdraw}>
          <SubmitButton variant="ghost" size="sm" pendingLabel="Withdrawing…">
            Withdraw request
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
