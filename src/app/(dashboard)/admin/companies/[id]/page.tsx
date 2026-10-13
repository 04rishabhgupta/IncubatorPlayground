import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { ReviewPanel } from "@/components/admin/review-panel";
import { CompanyLogo } from "@/components/company/company-logo";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/auth/session";
import { getCompanyForAdmin } from "@/lib/companies/queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Review company · Admin" };

const requestStatusLabel = {
  pending: "awaiting review",
  approved: "approved",
  rejected: "rejected",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminCompanyPage({ params }: PageProps<"/admin/companies/[id]">) {
  const { id } = await params;
  await requireRole(["super_admin"], `/admin/companies/${id}`);
  if (!UUID.test(id)) notFound();

  let company;
  try {
    company = await getCompanyForAdmin(id);
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Couldn&apos;t load this company. Please refresh the page.</Alert>;
  }
  if (!company) notFound();

  const details: Array<[string, React.ReactNode]> = [
    ["Industry", company.industry?.name ?? "—"],
    ["Public email", company.business_email],
    ["Phone", company.phone ?? "—"],
    ["Website", company.website ?? "—"],
    ["Founded", company.founded_year ?? "—"],
    ["Requested office", company.office_details ?? "—"],
    ["Assigned office", company.space?.label ?? "Not assigned"],
    ["Registered", formatDate(company.created_at, "datetime")],
    ["Account holder", company.owner ? `${company.owner.full_name || "—"} · ${company.owner.email}` : "—"],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Review company"
        title={company.name}
        description={company.tagline ?? undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/companies?status=${company.status}`} variant="secondary">
              Back to list
            </ButtonLink>
            <ButtonLink href={`/companies/${company.slug}`} variant="ghost">
              Profile preview
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Company details" action={<CompanyStatusBadge status={company.status} />} />
            <CardBody className="space-y-4">
              <div className="flex items-start gap-4">
                <CompanyLogo name={company.name} path={company.logo_path} size="lg" />
                <p className="whitespace-pre-line text-sm text-ink">
                  {company.description ?? "No description."}
                </p>
              </div>
              {company.services.length > 0 && (
                <p className="text-sm">
                  <span className="text-muted">Services: </span>
                  {company.services.join(", ")}
                </p>
              )}
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="break-words text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Registration history" description="Most recent first." />
            <CardBody>
              {company.requests.length === 0 ? (
                <p className="text-sm text-muted">No registration requests.</p>
              ) : (
                <ol className="space-y-4">
                  {company.requests.map((request) => (
                    <li key={request.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-ink">
                          {request.submitted_data?.resubmission ? "Resubmission" : "Initial registration"} ·{" "}
                          {requestStatusLabel[request.status]}
                        </span>
                        <span className="text-muted">
                          Submitted {formatDate(request.created_at, "datetime")}
                        </span>
                      </div>
                      {request.reviewed_at && (
                        <p className="mt-1 text-muted">
                          Reviewed {formatDate(request.reviewed_at, "datetime")}
                          {request.reviewer
                            ? ` by ${request.reviewer.full_name || request.reviewer.email}`
                            : ""}
                        </p>
                      )}
                      {request.review_notes && <p className="mt-2 text-ink">Note: {request.review_notes}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader title="Decision" />
          <CardBody className="space-y-4">
            {company.status_reason && (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
                <span className="text-muted">Current note: </span>
                {company.status_reason}
              </p>
            )}
            <ReviewPanel companyId={company.id} status={company.status} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
