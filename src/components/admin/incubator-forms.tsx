"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField, SelectField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  changeAnnouncement,
  createAnnouncement,
  deleteStaffMember,
  saveStaffMember,
} from "@/lib/admin/incubator-actions";
import { initialFormState, type FormState } from "@/lib/forms";

/** Admin forms for the FITT Incubation Team and announcements. */

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

const availabilityOptions = [
  { value: "unknown", label: "Unknown" },
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "unavailable", label: "Unavailable" },
];

export type StaffRow = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  availability: "available" | "busy" | "unavailable" | null;
  is_public: boolean;
  sort_order: number;
};

/** Add a FITT team member, or edit one (with remove). */
export function StaffMemberForm({ member }: { member?: StaffRow }) {
  const [state, action] = useActionState(saveStaffMember, initialFormState);
  const [removeState, remove] = useActionState(deleteStaffMember, initialFormState);
  const id = member?.id ?? "new";
  // After adding someone the form empties; after an error it keeps what was typed.
  const v = state.status === "error" ? state.values : undefined;
  const e = state.fieldErrors;
  return (
    <div className="space-y-3">
      <Message state={state} />
      <Message state={removeState} />
      <form
        action={action}
        key={state.status === "success" && !member ? state.message : undefined}
        className="space-y-3"
        noValidate
      >
        {member && <input type="hidden" name="staffId" value={member.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            id={`${id}-name`}
            name="fullName"
            label="Name"
            defaultValue={v?.fullName ?? member?.full_name}
            errors={e?.fullName}
          />
          <InputField
            id={`${id}-title`}
            name="jobTitle"
            label="Role"
            optional
            placeholder="e.g. Programme manager"
            defaultValue={v?.jobTitle ?? member?.job_title ?? ""}
            errors={e?.jobTitle}
          />
          <InputField
            id={`${id}-email`}
            name="email"
            type="email"
            label="Email"
            optional
            defaultValue={v?.email ?? member?.email ?? ""}
            errors={e?.email}
          />
          <InputField
            id={`${id}-phone`}
            name="phone"
            type="tel"
            label="Phone"
            optional
            defaultValue={v?.phone ?? member?.phone ?? ""}
            errors={e?.phone}
          />
          <SelectField
            id={`${id}-availability`}
            name="availability"
            label="Availability"
            options={availabilityOptions}
            defaultValue={v?.availability ?? member?.availability ?? "unknown"}
            errors={e?.availability}
          />
          <InputField
            id={`${id}-order`}
            name="sortOrder"
            label="Order"
            optional
            inputMode="numeric"
            hint="Lower numbers are listed first."
            defaultValue={v?.sortOrder ?? (member ? String(member.sort_order) : "")}
            errors={e?.sortOrder}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={v ? v.isPublic === "on" : (member?.is_public ?? true)}
            className="size-4 rounded border-border"
          />
          Show on the floor map
        </label>
        <SubmitButton size="sm" pendingLabel="Saving…">
          {member ? "Save" : "Add to the FITT team"}
        </SubmitButton>
      </form>
      {member && (
        <form action={remove}>
          <input type="hidden" name="staffId" value={member.id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…">
            Remove {member.full_name}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function AnnouncementForm({ floors }: { floors: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(createAnnouncement, initialFormState);
  const v = state.status === "error" ? state.values : undefined;
  const e = state.fieldErrors;
  return (
    <form
      action={action}
      key={state.status === "success" ? state.message : undefined}
      className="space-y-3"
      noValidate
    >
      <Message state={state} />
      <InputField name="title" label="Title" maxLength={120} defaultValue={v?.title} errors={e?.title} />
      <TextareaField
        name="body"
        label="Message"
        optional
        rows={3}
        maxLength={1000}
        defaultValue={v?.body}
        errors={e?.body}
      />
      <SelectField
        name="floorId"
        label="Show on"
        options={[
          { value: "all", label: "Every floor" },
          ...floors.map((f) => ({ value: f.id, label: f.name })),
        ]}
        defaultValue={v?.floorId ?? "all"}
        errors={e?.floorId}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          name="startsAt"
          type="datetime-local"
          label="Starts"
          optional
          hint="Leave empty to post now."
          defaultValue={v?.startsAt}
          errors={e?.startsAt}
        />
        <InputField
          name="endsAt"
          type="datetime-local"
          label="Ends"
          optional
          hint="Leave empty to keep it up until you end it."
          defaultValue={v?.endsAt}
          errors={e?.endsAt}
        />
      </div>
      <p className="text-xs text-muted">Times are in the building&apos;s time zone.</p>
      <SubmitButton pendingLabel="Posting…">Post announcement</SubmitButton>
    </form>
  );
}

/** End (running) or delete one announcement. */
export function AnnouncementActions({ id, running }: { id: string; running: boolean }) {
  const [state, action] = useActionState(changeAnnouncement, initialFormState);
  return (
    <div className="space-y-2">
      {state.status === "error" && <Message state={state} />}
      <form action={action} className="flex gap-2">
        <input type="hidden" name="announcementId" value={id} />
        {running && (
          <SubmitButton variant="secondary" size="sm" name="intent" value="end" pendingLabel="Ending…">
            End now
          </SubmitButton>
        )}
        <SubmitButton variant="ghost" size="sm" name="intent" value="delete" pendingLabel="Deleting…">
          Delete
        </SubmitButton>
      </form>
    </div>
  );
}
