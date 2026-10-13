import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { TeamMemberForm } from "@/components/availability/team-member-form";
import { TeamMemberRow } from "@/components/availability/team-member-row";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getOwnTeam } from "@/lib/availability/queries";
import { getOwnCompany } from "@/lib/companies/queries";

export const metadata: Metadata = { title: "Team · Company" };

export default async function CompanyTeamPage() {
  const { userId } = await requireRole(["company"], "/company/team");

  let company, team;
  try {
    company = await getOwnCompany(userId);
    team = company ? await getOwnTeam(company.id) : [];
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Your team couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }
  if (!company) {
    return (
      <Alert tone="warning" title="No company is linked to this account">
        Contact the platform admin to link your company.
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={company.name}
        title="Team"
        description="Team members are listed on your profile; they don't get their own sign-in. Keep their availability up to date so visitors know who to contact."
        action={
          <ButtonLink href="/company" variant="secondary">
            Back to dashboard
          </ButtonLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="self-start">
          <CardHeader
            title={`Team members (${team.length})`}
            description="Availability is self-reported and shows when it was last updated."
          />
          <CardBody>
            {team.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No team members yet. Add the first one.</p>
            ) : (
              <ul className="divide-y divide-border">
                {team.map((member, i) => (
                  <TeamMemberRow
                    key={member.id}
                    member={member}
                    isFirst={i === 0}
                    isLast={i === team.length - 1}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Add a team member" />
          <CardBody>
            <TeamMemberForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
