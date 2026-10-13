import type { z } from "zod";

/**
 * Shared result shape for Server Actions used with useActionState.
 * `values` echoes non-secret inputs so forms can repopulate after an error
 * (React resets uncontrolled forms when an action completes).
 */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

/** Read string fields from FormData, skipping files and the given secret keys. */
export function formValues(formData: FormData, omit: string[] = []): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !omit.includes(key) && !key.startsWith("$ACTION")) {
      values[key] = value;
    }
  }
  return values;
}

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}
