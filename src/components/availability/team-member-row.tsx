"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteTeamMember, moveTeamMember, setMemberAvailability } from "@/lib/availability/actions";
import type { OwnTeamMember } from "@/lib/availability/queries";
import { formatDate } from "@/lib/format";
import { initialFormState } from "@/lib/forms";
import { availabilityOptions } from "./availability-form";
import { TeamMemberForm } from "./team-member-form";

export function TeamMemberRow({
  member,
  isFirst,
  isLast,
}: {
  member: OwnTeamMember;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [statusState, statusAction, statusPending] = useActionState(setMemberAvailability, initialFormState);
  const [deleteState, deleteAction] = useActionState(deleteTeamMember, initialFormState);
  const [, moveAction, movePending] = useActionState(moveTeamMember, initialFormState);
  const selectId = `status-${member.id}`;
  const status = member.availability?.status ?? "unknown";
  const feedback =
    deleteState.status === "error" ? deleteState : statusState.status === "error" ? statusState : null;

  return (
    <li className="space-y-3 py-4" aria-label={member.full_name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{member.full_name}</p>
          {member.job_title && <p className="text-sm text-muted">{member.job_title}</p>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {!member.is_public && <Badge>Hidden from public</Badge>}
            {!member.is_bookable && <Badge>Not taking appointments</Badge>}
          </div>
        </div>

        <form action={statusAction} className="flex flex-col items-end gap-1">
          <input type="hidden" name="memberId" value={member.id} />
          <label htmlFor={selectId} className="sr-only">
            Availability of {member.full_name}
          </label>
          <select
            id={selectId}
            name="status"
            defaultValue={status}
            key={status /* reset after server refresh */}
            disabled={statusPending}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {availabilityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted" aria-live="polite">
            {statusPending
              ? "Saving…"
              : member.availability
                ? `Updated ${formatDate(member.availability.updated_at, "datetime")}`
                : "Not set"}
          </span>
          <noscript>
            <button type="submit">Save</button>
          </noscript>
        </form>
      </div>

      {feedback?.message && <Alert tone="error">{feedback.message}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          {editing ? "Close" : "Edit"}
        </Button>
        <form action={moveAction} className="contents">
          <input type="hidden" name="memberId" value={member.id} />
          <Button
            type="submit"
            name="direction"
            value="up"
            variant="ghost"
            size="sm"
            disabled={isFirst || movePending}
            aria-label={`Move ${member.full_name} up`}
          >
            ↑
          </Button>
          <Button
            type="submit"
            name="direction"
            value="down"
            variant="ghost"
            size="sm"
            disabled={isLast || movePending}
            aria-label={`Move ${member.full_name} down`}
          >
            ↓
          </Button>
        </form>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!window.confirm(`Remove ${member.full_name} from the team?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="memberId" value={member.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-status-unavailable">
            Remove
          </Button>
        </form>
      </div>

      {editing && (
        <div className="rounded-lg border border-border bg-surface-muted/50 p-4">
          <TeamMemberForm member={member} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">{children}</span>;
}
