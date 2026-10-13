import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { CompanyAvailabilityForm } from "@/components/availability/availability-form";
import { AvailabilityBadge } from "@/components/company/availability-badge";
import { CompanyLogo } from "@/components/company/company-logo";
import { ResubmitButton } from "@/components/company/resubmit-button";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/auth/session";
import { countPendingRequests } from "@/lib/appointments/queries";
import { getCompanyAvailability, getOwnTeam } from "@/lib/availability/queries";
import { getOwnCompany } from "@/lib/companies/queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Company dashboard" };

const statusCopy = {
  pending: {
    tone: "warning",
    title: "Your registration is under review",
    body: "The platform admin will review your details. Your company stays hidden from the public directory and floor map until it is approved.",
  },
  approved: {
    tone: "success",
    title: "Your company is live",
    body: "Visitors can find your company in the directory.",
  },
  rejected: {
    tone: "error",
    title: "Your registration was not approved",
    body: "Update your profile to address the admin's note, then resubmit it for review.",
  },
  suspended: {
    tone: "error",
    title: "Your company is suspended",
    body: "Your company is hidden from the directory. Contact the platform admin to resolve this.",
  },
} as const;

export default async function CompanyDashboardPage() {
  const { userId } = await requireRole(["company"], "/company");

  let company, availability;
  let pendingRequests = 0;
  let team: Awaited<ReturnType<typeof getOwnTeam>> = [];
  try {
    company = await getOwnCompany(userId);
    if (company) {
      [availability, team, pendingRequests] = await Promise.all([
        getCompanyAvailability(company.id),
        getOwnTeam(company.id),
        countPendingRequests(company.id),
      ]);
    }
  } catch (error) {
    unstable_rethrow(error);
    return (
      <Alert tone="error" title="We couldn't load your company">
        Please refresh the page or try again later.
      </Alert>
    );
  }

  if (!company) {
    return (
      <>
        <PageHeader title="Company dashboard" />
        <Alert tone="warning" title="No company is linked to this account">
          Contact the platform admin to link your company.
        </Alert>
      </>
    );
  }

  const copy = statusCopy[company.status];
  const details: Array<[string, string | null]> = [
    ["Industry", company.industry?.name ?? null],
    ["Business email", company.business_email],
    ["Phone", company.phone],
    ["Website", company.website],
    ["Founded", company.founded_year ? String(company.founded_year) : null],
    [
      "Office",
      company.space?.label ?? (company.office_details ? `Requested: ${company.office_details}` : null),
    ],
    ["Registered", formatDate(company.created_at)],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title={company.name}
        description={company.tagline ?? undefined}
        action={
          <div className="flex flex-wrap gap-2">
            {company.status === "approved" && (
              <ButtonLink href={`/companies/${company.slug}`} variant="secondary">
                View public profile
              </ButtonLink>
            )}
            <ButtonLink href="/company/appointments" variant="secondary">
              Appointments{pendingRequests > 0 ? ` (${pendingRequests} new)` : ""}
            </ButtonLink>
            <ButtonLink href="/company/profile">Edit profile</ButtonLink>
          </div>
        }
      />

      <div className="space-y-6">
        <Alert tone={copy.tone} title={copy.title}>
          {copy.body}
          {company.status_reason && <p className="mt-2 font-medium">Admin note: {company.status_reason}</p>}
          {company.status === "rejected" && (
            <div className="mt-3">
              <ResubmitButton />
            </div>
          )}
        </Alert>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader
              title="Availability"
              description={
                availability
                  ? `Last updated ${formatDate(availability.updated_at, "datetime")}`
                  : "Not set — visitors see Unknown."
              }
            />
            <CardBody>
              <CompanyAvailabilityForm current={availability ?? null} />
            </CardBody>
          </Card>
          <Card className="self-start">
            <CardHeader
              title="Team"
              action={
                <ButtonLink href="/company/team" variant="secondary" size="sm">
                  Manage team
                </ButtonLink>
              }
            />
            <CardBody>
              {!team?.length ? (
                <p className="text-sm text-muted">No team members yet.</p>
              ) : (
                <ul className="space-y-2">
                  {team.slice(0, 6).map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-ink">{member.full_name}</span>
                      <AvailabilityBadge availability={member.availability} />
                    </li>
                  ))}
                  {team.length > 6 && <li className="text-xs text-muted">and {team.length - 6} more</li>}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Company profile" action={<CompanyStatusBadge status={company.status} />} />
          <CardBody className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <CompanyLogo name={company.name} path={company.logo_path} size="lg" />
            <div className="space-y-4">
              {company.description && (
                <p className="whitespace-pre-line text-sm text-ink">{company.description}</p>
              )}
              {company.services.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Services">
                  {company.services.map((s) => (
                    <li key={s} className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs text-ink">
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="break-words text-ink">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
