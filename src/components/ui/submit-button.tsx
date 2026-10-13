"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** Submit button that disables itself and shows progress while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "Please wait…") : children}
    </Button>
  );
}
