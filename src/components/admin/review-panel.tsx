"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { reviewCompany } from "@/lib/admin/actions";
import type { CompanyStatus } from "@/lib/companies/queries";
import { initialFormState } from "@/lib/forms";

const actionsByStatus: Record<
  CompanyStatus,
  Array<{ decision: string; label: string; variant: "primary" | "secondary" | "danger" }>
> = {
  pending: [
    { decision: "approve", label: "Approve", variant: "primary" },
    { decision: "reject", label: "Reject", variant: "danger" },
  ],
  rejected: [{ decision: "approve", label: "Approve anyway", variant: "primary" }],
  approved: [{ decision: "suspend", label: "Suspend", variant: "danger" }],
  suspended: [{ decision: "reinstate", label: "Reinstate", variant: "primary" }],
};

const help: Record<CompanyStatus, string> = {
  pending:
    "Approving publishes the company in the directory. Rejecting requires a reason, which the company sees.",
  rejected: "The company can edit its profile and resubmit. You can also approve it directly.",
  approved: "Suspending hides the company from the directory. A reason is required and shown to the company.",
  suspended: "Reinstating makes the company visible again.",
};

export function ReviewPanel({ companyId, status }: { companyId: string; status: CompanyStatus }) {
  const [state, action] = useActionState(reviewCompany, initialFormState);
  const needsReason = status === "pending" || status === "approved";

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      <p className="text-sm text-muted">{help[status]}</p>
      <input type="hidden" name="companyId" value={companyId} />
      {needsReason && (
        <TextareaField
          name="reason"
          label="Reason"
          required={false}
          hint={
            status === "pending"
              ? "Required to reject. The company will see it."
              : "Required to suspend. The company will see it."
          }
          rows={3}
          maxLength={1000}
          defaultValue={state.status === "error" ? state.values?.reason : ""}
          errors={state.fieldErrors?.reason}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {actionsByStatus[status].map((a) => (
          <SubmitButton
            key={a.decision}
            name="decision"
            value={a.decision}
            variant={a.variant}
            pendingLabel="Saving…"
          >
            {a.label}
          </SubmitButton>
        ))}
      </div>
    </form>
  );
}
