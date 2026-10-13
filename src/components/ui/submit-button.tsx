"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** Submit button that disables itself and shows progress while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={className}
    >
      {pending ? (pendingLabel ?? "Please wait…") : children}
    </Button>
  );
}
