import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Company dashboard" };

const statusCopy = {
  pending: {
    tone: "warning",
    title: "Your registration is under review",
    body: "The platform admin will review your details. Your company stays hidden from the public directory and floor map until it is approved.",
  },
  approved: {
    tone: "success",
    title: "Your company is approved",
    body: "Your company is visible to visitors on the platform.",
  },
  rejected: {
    tone: "error",
    title: "Your registration was not approved",
    body: "Contact the platform admin if you have questions about this decision.",
  },
  suspended: {
    tone: "error",
    title: "Your company is suspended",
    body: "Your company is hidden from the public directory. Contact the platform admin to resolve this.",
  },
} as const;

export default async function CompanyDashboardPage() {
  const { userId } = await requireRole(["company"], "/company");
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "id, name, tagline, description, website, business_email, phone, office_details, founded_year, logo_path, status, status_reason, created_at, industry:industries(name), space:floor_spaces(label)",
    )
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
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
  const logoUrl = company.logo_path
    ? supabase.storage.from("company-logos").getPublicUrl(company.logo_path).data.publicUrl
    : null;

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
    ["Registered", new Date(company.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title={company.name}
        description={company.tagline ?? undefined}
        action={
          <ButtonLink href="/settings" variant="secondary">
            Account settings
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <Alert tone={copy.tone} title={copy.title}>
          {copy.body}
          {company.status_reason && <p className="mt-2">Note from the admin: {company.status_reason}</p>}
        </Alert>

        <Card>
          <CardHeader title="Company profile" action={<CompanyStatusBadge status={company.status} />} />
          <CardBody className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={`${company.name} logo`}
                  width={96}
                  height={96}
                  className="object-contain"
                />
              ) : (
                <span className="text-2xl font-semibold text-muted" aria-hidden="true">
                  {company.name.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="space-y-4">
              {company.description && (
                <p className="whitespace-pre-line text-sm text-ink">{company.description}</p>
              )}
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-ink">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </CardBody>
        </Card>
        <p className="text-sm text-muted">
          Profile editing, team members and availability are added in the next phases.
        </p>
      </div>
    </>
  );
}
