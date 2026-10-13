"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveTeamMember } from "@/lib/availability/actions";
import type { OwnTeamMember } from "@/lib/availability/queries";
import { initialFormState } from "@/lib/forms";

/** Add (no `member`) or edit a team member record. */
export function TeamMemberForm({ member, onDone }: { member?: OwnTeamMember; onDone?: () => void }) {
  const [state, action] = useActionState(saveTeamMember, initialFormState);
  const v = state.status === "error" ? state.values : undefined;
  const prefix = member ? `member-${member.id}-` : "new-member-";

  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (state.status === "success") done.current?.();
  }, [state]);

  const checked = (name: "isPublic" | "isBookable", fallback: boolean) => (v ? v[name] === "on" : fallback);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      )}
      {member && <input type="hidden" name="memberId" value={member.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          id={`${prefix}fullName`}
          name="fullName"
          label="Full name"
          defaultValue={v?.fullName ?? member?.full_name ?? ""}
          maxLength={120}
          errors={state.fieldErrors?.fullName}
        />
        <InputField
          id={`${prefix}jobTitle`}
          name="jobTitle"
          label="Role or job title"
          optional
          defaultValue={v?.jobTitle ?? member?.job_title ?? ""}
          maxLength={120}
          errors={state.fieldErrors?.jobTitle}
        />
      </div>
      <InputField
        id={`${prefix}email`}
        name="email"
        type="email"
        label="Public contact email"
        optional
        hint="Shown on your public profile if this person is visible."
        defaultValue={v?.email ?? member?.email ?? ""}
        errors={state.fieldErrors?.email}
      />
      <TextareaField
        id={`${prefix}bio`}
        name="bio"
        label="Short bio"
        optional
        rows={2}
        maxLength={1000}
        defaultValue={v?.bio ?? member?.bio ?? ""}
        errors={state.fieldErrors?.bio}
      />
      <div className="flex flex-col gap-2 text-sm text-ink sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={checked("isPublic", member?.is_public ?? true)}
            className="size-4 accent-brand-600"
          />
          Show on public profile
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isBookable"
            defaultChecked={checked("isBookable", member?.is_bookable ?? true)}
            className="size-4 accent-brand-600"
          />
          Accepts appointment requests
        </label>
      </div>
      <SubmitButton pendingLabel="Saving…">{member ? "Save changes" : "Add team member"}</SubmitButton>
    </form>
  );
}
