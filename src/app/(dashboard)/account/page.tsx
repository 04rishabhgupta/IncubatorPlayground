import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const { profile } = await requireRole(["visitor"], "/account");
  const firstName = profile.full_name.split(" ")[0] || "there";

  return (
    <>
      <PageHeader
        eyebrow="Visitor"
        title={`Hi, ${firstName}`}
        description="Explore the floor and get in touch with the companies working on it."
        action={
          <ButtonLink href="/settings" variant="secondary">
            Settings
          </ButtonLink>
        }
      />
      <Card>
        <CardHeader
          title="Your activity"
          description="Conversations and appointment requests with companies will be listed here."
        />
        <CardBody>
          <p className="text-sm text-muted">Nothing here yet.</p>
        </CardBody>
      </Card>
    </>
  );
}
