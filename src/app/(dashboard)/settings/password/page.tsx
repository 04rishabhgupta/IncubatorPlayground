import type { Metadata } from "next";
import { PasswordForm } from "@/components/account/password-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Change password" };

export default async function PasswordPage() {
  await requireSession("/settings/password");

  return (
    <div className="max-w-lg">
      <PageHeader title="Change password" description="Choose a new password for your account." />
      <Card>
        <CardBody className="py-6">
          <PasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
