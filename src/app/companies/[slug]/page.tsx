import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AvailabilityBadge } from "@/components/company/availability-badge";
import { CompanyLogo } from "@/components/company/company-logo";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { getCompanyProfile } from "@/lib/companies/queries";
import { displayUrl } from "@/lib/format";

export const metadata: Metadata = { title: "Company profile" };

export default function CompanyProfilePage({ params }: PageProps<"/companies/[slug]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/directory" className="text-sm text-brand-700 hover:underline">
        ← Back to directory
      </Link>
      <Suspense fallback={<ProfileSkeleton />}>
        <CompanyProfile params={params} />
      </Suspense>
    </div>
  );
}

async function CompanyProfile({ params }: Pick<PageProps<"/companies/[slug]">, "params">) {
  const { slug } = await params;
  const company = await getCompanyProfile(slug);
  if (!company) notFound();

  const location = [company.floor?.name, company.space?.label].filter(Boolean).join(" · ");

  return (
    <div className="mt-6 space-y-6">
      <LiveRefresh channel="profile-availability" tables={["company_availability", "member_availability"]} />
      {company.status !== "approved" && (
        <Alert tone="warning" title="This profile is not public">
          Only you and the platform admin can see it until the company is approved.{" "}
          <CompanyStatusBadge status={company.status} />
        </Alert>
      )}

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <CompanyLogo name={company.name} path={company.logo_path} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{company.name}</h1>
          {company.tagline && <p className="mt-1 text-muted">{company.tagline}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            {company.industry && (
              <Link
                href={`/directory?industry=${company.industry.slug}`}
                className="rounded-full bg-brand-50 px-2.5 py-0.5 font-medium text-brand-800 hover:bg-brand-100"
              >
                {company.industry.name}
              </Link>
            )}
            <AvailabilityBadge availability={company.availability} showUpdated />
          </div>
        </div>
        {company.status === "approved" && (
          <ButtonLink href={`/companies/${company.slug}/book`} className="shrink-0">
            Request an appointment
          </ButtonLink>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="About" />
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-6 text-ink">
                {company.description ?? "No description yet."}
              </p>
            </CardBody>
          </Card>

          {company.services.length > 0 && (
            <Card>
              <CardHeader title="Services" />
              <CardBody>
                <ul className="flex flex-wrap gap-2">
                  {company.services.map((service) => (
                    <li
                      key={service}
                      className="rounded-lg border border-border bg-surface-muted px-3 py-1 text-sm text-ink"
                    >
                      {service}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Team" />
            <CardBody>
              {company.team.length === 0 ? (
                <p className="text-sm text-muted">No team members listed yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {company.team.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-medium text-ink">{member.full_name}</p>
                        {member.job_title && <p className="text-sm text-muted">{member.job_title}</p>}
                        {member.email && (
                          <a
                            href={`mailto:${member.email}`}
                            className="break-all text-sm text-brand-700 hover:underline"
                          >
                            {member.email}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <AvailabilityBadge availability={member.availability} />
                        {company.status === "approved" && member.is_bookable && (
                          <Link
                            href={`/companies/${company.slug}/book?member=${member.id}`}
                            className="text-sm font-medium text-brand-700 hover:underline"
                            aria-label={`Book an appointment with ${member.full_name}`}
                          >
                            Book
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader title="Contact & location" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Detail label="Office">
                {location || "Not assigned yet"}
                {company.space && company.status === "approved" && (
                  <Link
                    href={`/?company=${company.slug}`}
                    className="mt-1 block font-medium text-brand-700 hover:underline"
                  >
                    View on floor map
                  </Link>
                )}
              </Detail>
              <Detail label="Email">
                <a
                  href={`mailto:${company.business_email}`}
                  className="break-all text-brand-700 hover:underline"
                >
                  {company.business_email}
                </a>
              </Detail>
              {company.phone && (
                <Detail label="Phone">
                  <a
                    href={`tel:${company.phone.replace(/\s/g, "")}`}
                    className="text-brand-700 hover:underline"
                  >
                    {company.phone}
                  </a>
                </Detail>
              )}
              {company.website && (
                <Detail label="Website">
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="break-all text-brand-700 hover:underline"
                  >
                    {displayUrl(company.website)}
                  </a>
                </Detail>
              )}
              {company.founded_year && <Detail label="Founded">{company.founded_year}</Detail>}
            </dl>
            {company.availability?.note && (
              <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
                {company.availability.note}
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-6" aria-busy="true" aria-label="Loading company">
      <div className="flex items-center gap-5">
        <div className="size-24 rounded-xl bg-surface-muted" />
        <div className="h-8 w-1/2 rounded bg-surface-muted" />
      </div>
      <div className="h-48 rounded-xl bg-surface-muted" />
    </div>
  );
}
