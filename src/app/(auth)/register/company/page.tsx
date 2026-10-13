import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-heading";
import { CompanyRegisterForm } from "@/components/auth/company-register-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { homeForRole } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Register your company" };

export default async function CompanyRegisterPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.profile.role));

  const supabase = await createClient();
  const { data: industries, error } = await supabase.from("industries").select("slug, name").order("name");

  return (
    <div className="sm:-mx-16">
      <AuthHeading
        title="Register your company"
        description="Put your startup on the floor map so neighbours and visitors can find and contact you."
      />
      <Card>
        <CardBody className="py-6">
          {error || !industries?.length ? (
            <Alert tone="error" title="Registration is unavailable right now">
              We couldn&apos;t load the form. Please refresh the page or try again later.
            </Alert>
          ) : (
            <CompanyRegisterForm industries={industries} />
          )}
        </CardBody>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
