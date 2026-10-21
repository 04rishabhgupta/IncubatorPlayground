import type { Metadata } from "next";
import { StaffMemberForm, type StaffRow } from "@/components/admin/incubator-forms";
import { AvailabilityBadge } from "@/components/company/availability-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "FITT Incubation Team · Admin" };

export default async function FittTeamPage() {
  await requireRole(["super_admin"], "/admin/fitt-team");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incubator_staff")
    .select(
      "id, full_name, job_title, email, phone, availability, availability_updated_at, is_public, sort_order",
    )
    .order("sort_order")
    .order("full_name");

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="FITT Incubation Team"
        description="The incubator's own team. Visitors see them when they open Reception on the floor map and in the building overview."
        action={
          <ButtonLink href="/admin" variant="secondary">
            Overview
          </ButtonLink>
        }
      />
      {error ? (
        <Alert tone="error">The team couldn&apos;t be loaded. Please refresh the page.</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card className="self-start">
            <CardHeader title={`Team (${data.length})`} />
            <CardBody>
              {data.length === 0 ? (
                <p className="text-sm text-muted">No one yet. Add the first team member.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.map((member) => (
                    <li key={member.id} className="py-3 first:pt-0 last:pb-0">
                      <details>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {member.full_name}
                              {!member.is_public && (
                                <span className="ml-2 rounded bg-surface-muted px-1.5 text-xs font-normal text-muted">
                                  Hidden
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {[member.job_title, member.email, member.phone].filter(Boolean).join(" · ") ||
                                "—"}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            <AvailabilityBadge
                              availability={
                                member.availability && member.availability_updated_at
                                  ? {
                                      status: member.availability,
                                      updated_at: member.availability_updated_at,
                                    }
                                  : null
                              }
                            />
                            <span className="text-xs text-brand-700">Edit</span>
                          </span>
                        </summary>
                        <div className="mt-3">
                          <StaffMemberForm member={member as StaffRow} />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card className="self-start">
            <CardHeader title="Add a team member" />
            <CardBody>
              <StaffMemberForm />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
