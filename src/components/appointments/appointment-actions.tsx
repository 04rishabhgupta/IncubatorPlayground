"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelAppointment, completeAppointment, respondToAppointment } from "@/lib/appointments/actions";
import { initialFormState, type FormState } from "@/lib/forms";

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

/** Company: accept (with meeting details) or decline a pending request. */
export function RespondForm({
  appointmentId,
  meetingType,
  defaultLocation,
  blocked,
}: {
  appointmentId: string;
  meetingType: "in_person" | "online";
  defaultLocation?: string;
  /** Accepting would violate the overlap rule; the database would refuse it anyway. */
  blocked?: boolean;
}) {
  const [state, action] = useActionState(respondToAppointment, initialFormState);
  const prefix = `respond-${appointmentId}-`;
  if (state.status === "success") return <Result state={state} />;
  return (
    <form action={action} className="space-y-3 border-t border-border pt-3" noValidate>
      <Result state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="meetingType" value={meetingType} />
      {meetingType === "online" ? (
        <InputField
          id={`${prefix}meetingLink`}
          name="meetingLink"
          type="url"
          label="Meeting link"
          required={false}
          hint="Needed to accept an online meeting; not needed to decline."
          placeholder="https://"
          defaultValue={state.values?.meetingLink}
          errors={state.fieldErrors?.meetingLink}
        />
      ) : (
        <InputField
          id={`${prefix}locationNote`}
          name="locationNote"
          label="Where to meet"
          optional
          maxLength={300}
          defaultValue={state.values?.locationNote ?? defaultLocation}
          errors={state.fieldErrors?.locationNote}
        />
      )}
      <TextareaField
        id={`${prefix}note`}
        name="note"
        label="Message to the requester"
        optional
        rows={2}
        maxLength={1000}
        defaultValue={state.values?.note}
        errors={state.fieldErrors?.note}
      />
      <div className="flex flex-wrap gap-2">
        {!blocked && (
          <SubmitButton name="decision" value="accept" pendingLabel="Saving…">
            Accept
          </SubmitButton>
        )}
        <SubmitButton name="decision" value="reject" variant="secondary" pendingLabel="Saving…">
          Decline
        </SubmitButton>
      </div>
    </form>
  );
}

/** Either side: cancel, with an optional note (asks for confirmation first). */
export function CancelForm({
  appointmentId,
  label = "Cancel appointment",
}: {
  appointmentId: string;
  label?: string;
}) {
  const [state, action] = useActionState(cancelAppointment, initialFormState);
  const [open, setOpen] = useState(false);
  if (state.status === "success") return <Result state={state} />;
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-status-unavailable" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 border-t border-border pt-3" noValidate>
      <Result state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <TextareaField
        id={`cancel-${appointmentId}-note`}
        name="note"
        label="Reason"
        optional
        rows={2}
        maxLength={1000}
      />
      <div className="flex gap-2">
        <SubmitButton variant="danger" pendingLabel="Cancelling…">
          Confirm cancellation
        </SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

/** Company: mark an accepted meeting that has started as completed. */
export function CompleteForm({ appointmentId }: { appointmentId: string }) {
  const [state, action] = useActionState(completeAppointment, initialFormState);
  if (state.status === "success") return <Result state={state} />;
  return (
    <form action={action} className="space-y-2">
      <Result state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Mark as completed
      </SubmitButton>
    </form>
  );
}
