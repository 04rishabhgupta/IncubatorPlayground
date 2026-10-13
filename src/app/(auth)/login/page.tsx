import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { homeForRole, safeNextPath } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const notices: Record<string, string> = {
  link: "That link has expired or was opened in a different browser. If you just confirmed your email, sign in below.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next) ?? undefined;

  const session = await getSession();
  if (session) redirect(next ?? homeForRole(session.profile.role));

  const notice = typeof params.notice === "string" ? notices[params.notice] : undefined;

  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back to the floor." />
      {notice && (
        <div className="mb-4">
          <Alert tone="info">{notice}</Alert>
        </div>
      )}
      <Card>
        <CardBody className="py-6">
          <LoginForm next={next} />
        </CardBody>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>{" "}
        or{" "}
        <Link href="/register/company" className="font-medium text-brand-700 hover:underline">
          register your company
        </Link>
        .
      </p>
    </>
  );
}
