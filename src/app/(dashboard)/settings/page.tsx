import type { Metadata } from "next";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { profile } = await requireSession("/settings");

  return (
    <>
      <PageHeader eyebrow={`${roleLabels[profile.role]} account`} title="Settings" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Profile" description="Your name is shown to companies you contact." />
          <CardBody>
            <ProfileForm fullName={profile.full_name} phone={profile.phone ?? ""} email={profile.email} />
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Password" />
          <CardBody>
            <ButtonLink href="/settings/password" variant="secondary">
              Change password
            </ButtonLink>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
