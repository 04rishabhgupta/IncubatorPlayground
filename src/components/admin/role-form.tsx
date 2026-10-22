"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeUserRole } from "@/lib/admin/user-actions";
import { initialFormState } from "@/lib/forms";

/** Make a visitor an admin, or an admin a visitor. Other changes aren't offered (see the database rules). */
export function RoleForm({
  userId,
  email,
  role,
}: {
  userId: string;
  email: string;
  role: "visitor" | "super_admin";
}) {
  const [state, action] = useActionState(changeUserRole, initialFormState);
  const next = role === "visitor" ? "super_admin" : "visitor";
  return (
    <form
      action={(formData) => {
        const question =
          next === "super_admin"
            ? `Make ${email} a platform admin? They will be able to approve companies, change floors and manage users.`
            : `Remove admin rights from ${email}?`;
        if (window.confirm(question)) action(formData);
      }}
      className="space-y-1"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={next} />
      <SubmitButton variant={next === "super_admin" ? "secondary" : "ghost"} size="sm" pendingLabel="Saving…">
        {next === "super_admin" ? "Make admin" : "Remove admin"}
      </SubmitButton>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "text-xs text-red-700" : "text-xs text-green-800"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
