import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-surface-muted";

type FieldProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  errors?: string[];
  optional?: boolean;
  children: (controlProps: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => ReactNode;
};

/** Label + control + hint + error messages, wired up for accessibility. */
export function Field({ id, label, hint, errors, optional, children }: FieldProps) {
  const hasError = Boolean(errors?.length);
  const describedBy = [hint ? `${id}-hint` : null, hasError ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      {children({
        id,
        "aria-invalid": hasError,
        "aria-describedby": describedBy || undefined,
        className: cn(control, hasError ? "border-status-unavailable" : "border-border"),
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={`${id}-error`} className="text-xs text-status-unavailable">
          {errors![0]}
        </p>
      )}
    </div>
  );
}

type InputFieldProps = Omit<ComponentProps<"input">, "id" | "className"> & {
  name: string;
  /** Defaults to `name`; set it when the same form appears more than once on a page. */
  id?: string;
  label: string;
  hint?: ReactNode;
  errors?: string[];
  optional?: boolean;
};

export function InputField({ name, id = name, label, hint, errors, optional, ...props }: InputFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} errors={errors} optional={optional}>
      {(controlProps) => <input name={name} required={!optional} {...controlProps} {...props} />}
    </Field>
  );
}

type TextareaFieldProps = Omit<ComponentProps<"textarea">, "id" | "className"> & {
  name: string;
  id?: string;
  label: string;
  hint?: ReactNode;
  errors?: string[];
  optional?: boolean;
};

export function TextareaField({
  name,
  id = name,
  label,
  hint,
  errors,
  optional,
  rows = 4,
  ...props
}: TextareaFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} errors={errors} optional={optional}>
      {(controlProps) => (
        <textarea name={name} rows={rows} required={!optional} {...controlProps} {...props} />
      )}
    </Field>
  );
}

type SelectFieldProps = Omit<ComponentProps<"select">, "id" | "className"> & {
  name: string;
  id?: string;
  label: string;
  hint?: ReactNode;
  errors?: string[];
  optional?: boolean;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
};

export function SelectField({
  name,
  id = name,
  label,
  hint,
  errors,
  optional,
  placeholder,
  options,
  ...props
}: SelectFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} errors={errors} optional={optional}>
      {(controlProps) => (
        <select name={name} required={!optional} {...controlProps} {...props}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
