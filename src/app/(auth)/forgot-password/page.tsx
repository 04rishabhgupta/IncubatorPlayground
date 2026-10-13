import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { EmailOnlyForm } from "@/components/auth/email-only-form";
import { Card, CardBody } from "@/components/ui/card";
import { requestPasswordReset } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="Enter your account email and we'll send you a link to choose a new password."
      />
      <Card>
        <CardBody className="py-6">
          <EmailOnlyForm
            action={requestPasswordReset}
            submitLabel="Send reset link"
            pendingLabel="Sending…"
          />
        </CardBody>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
