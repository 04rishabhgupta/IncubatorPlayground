import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-heading";
import { VisitorRegisterForm } from "@/components/auth/visitor-register-form";
import { Card, CardBody } from "@/components/ui/card";
import { homeForRole } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.profile.role));

  return (
    <>
      <AuthHeading
        title="Create an account"
        description="Chat with companies on the floor and request appointments."
      />
      <Card>
        <CardBody className="py-6">
          <VisitorRegisterForm />
        </CardBody>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
        <br />
        Representing a company?{" "}
        <Link href="/register/company" className="font-medium text-brand-700 hover:underline">
          Register your company
        </Link>
      </p>
    </>
  );
}
