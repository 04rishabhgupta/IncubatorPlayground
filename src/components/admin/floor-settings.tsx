"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateFloorDetails } from "@/lib/admin/floor-actions";
import type { FloorSummary } from "@/lib/floor/queries";
import { initialFormState, type FormState } from "@/lib/forms";

export function FloorSettingsModal({
  floor,
  isOpen,
  onClose,
}: {
  floor: FloorSummary & { is_active: boolean };
  isOpen: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [state, action] = useActionState<FormState, FormData>(updateFloorDetails, initialFormState);

  useEffect(() => {
    if (state.status === "success") {
      const t = setTimeout(() => {
        onClose();
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [state.status, onClose]);

  // Focus the dialog when it opens and give focus back to whatever opened it when it closes.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="floor-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div>
              <h2 id="floor-settings-title" className="text-base font-bold text-ink">
                Floor settings · {floor.name}
              </h2>
              <p className="text-xs text-muted">Update floor name, tagline, description and visibility.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close floor settings"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-4.5" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <form action={action} className="p-5 space-y-4">
          <input type="hidden" name="floorId" value={floor.id} />

          {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
          {state.status === "success" && <Alert tone="success">{state.message}</Alert>}

          <InputField
            name="name"
            label="Floor name"
            defaultValue={floor.name}
            errors={state.fieldErrors?.name}
            maxLength={60}
          />

          <InputField
            name="tagline"
            label="Tagline"
            defaultValue={floor.tagline ?? ""}
            errors={state.fieldErrors?.tagline}
            hint="A short description of this floor's theme or focus (e.g. Deep tech, robotics & AI)."
            optional
            maxLength={160}
          />

          <TextareaField
            name="description"
            label="Description"
            defaultValue={floor.description ?? ""}
            errors={state.fieldErrors?.description}
            hint="Overview of facilities, labs, equipment and spaces on this floor."
            optional
            rows={3}
            maxLength={1000}
          />

          <div className="flex items-center gap-2 pt-1">
            <input
              id="isActive"
              name="isActive"
              type="checkbox"
              defaultChecked={floor.is_active}
              value="true"
              className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-ink">
              Floor is active and visible on the public map
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
            >
              Cancel
            </button>
            <SubmitButton size="sm">Save floor settings</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
