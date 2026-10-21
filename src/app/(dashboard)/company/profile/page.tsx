import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { CompanyLogo } from "@/components/company/company-logo";
import { CompanyProfileForm } from "@/components/company/company-profile-form";
import { LogoForm } from "@/components/company/logo-form";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getOwnCompany, listIndustries } from "@/lib/companies/queries";

export const metadata: Metadata = { title: "Edit company profile" };

export default async function CompanyProfileEditPage() {
  const { userId } = await requireRole(["company"], "/company/profile");

  let company, industries;
  try {
    [company, industries] = await Promise.all([getOwnCompany(userId), listIndustries()]);
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
      <Alert tone="warning" title="No company is linked to this account">
        Contact the platform admin to link your company.
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Edit company profile"
        description="Changes to an approved company appear in the directory straight away."
        action={
          <ButtonLink href="/company" variant="secondary">
            Back to dashboard
          </ButtonLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <CompanyProfileForm
              industries={industries}
              defaults={{
                name: company.name,
                industry: company.industry?.slug ?? "",
                tagline: company.tagline ?? "",
                description: company.description ?? "",
                services: company.services.join("\n"),
                stage: company.stage ?? "",
                teamSize: company.team_size ? String(company.team_size) : "",
                techStack: company.tech_stack.join(", "),
                website: company.website ?? "",
                businessEmail: company.business_email,
                phone: company.phone ?? "",
                officeDetails: company.office_details ?? "",
                foundedYear: company.founded_year ? String(company.founded_year) : "",
              }}
            />
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Logo" />
          <CardBody className="space-y-4">
            <CompanyLogo name={company.name} path={company.logo_path} size="lg" />
            <LogoForm hasLogo={Boolean(company.logo_path)} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
