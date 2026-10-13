import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { EmailOnlyForm } from "@/components/auth/email-only-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { resendConfirmation } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/check-email">) {
  const { logo } = await searchParams;

  return (
    <>
      <AuthHeading
        title="Check your email"
        description="If the address can be registered, we've sent a confirmation link to it. Open the link to activate your account, then sign in."
      />
      <div className="space-y-4">
        {logo === "failed" && (
          <Alert tone="warning" title="Your logo wasn't uploaded">
            Your registration was received, but the logo couldn&apos;t be saved. You can add it from your
            company dashboard after signing in.
          </Alert>
        )}
        <Card>
          <CardHeader
            title="Didn't get the email?"
            description="Check your spam folder, or request a new confirmation link."
          />
          <CardBody>
            <EmailOnlyForm
              action={resendConfirmation}
              submitLabel="Resend confirmation link"
              pendingLabel="Sending…"
            />
          </CardBody>
        </Card>
        <p className="text-center text-sm text-muted">
          Already confirmed?{" "}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
