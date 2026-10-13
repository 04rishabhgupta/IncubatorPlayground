import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { BookingForm } from "@/components/appointments/booking-form";
import { CompanyLogo } from "@/components/company/company-logo";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { getBookingContext, listMyAppointments } from "@/lib/appointments/queries";
import { BOOKING_RULES } from "@/lib/appointments/rules";
import { addDays, utcToWallTime, zoneLabel } from "@/lib/appointments/time";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Request an appointment" };

export default function BookPage({ params, searchParams }: PageProps<"/companies/[slug]/book">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-muted" />}>
        <Booking params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Booking({
  params,
  searchParams,
}: Pick<PageProps<"/companies/[slug]/book">, "params" | "searchParams">) {
  const { slug } = await params;
  const { member } = await searchParams;
  const session = await requireSession(`/companies/${slug}/book`);

  let context, mine;
  try {
    [context, mine] = await Promise.all([getBookingContext(slug), listMyAppointments(session.userId)]);
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">The booking form couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }
  if (!context) notFound();

  const back = (
    <Link href={`/companies/${slug}`} className="text-sm text-brand-700 hover:underline">
      ← Back to {context.company.name}
    </Link>
  );

  if (context.company.owner_id === session.userId) {
    return (
      <div className="space-y-4">
        {back}
        <Alert tone="info" title="This is your company">
          You can&apos;t book an appointment with your own company. Requests from others appear in your{" "}
          <Link href="/company/appointments" className="underline">
            appointment inbox
          </Link>
          .
        </Alert>
      </div>
    );
  }

  const now = new Date();
  const today = utcToWallTime(now, context.timezone).date;
  const nowIso = now.toISOString();
  const upcoming = mine
    .filter((a) => (a.status === "pending" || a.status === "accepted") && a.ends_at > nowIso)
    .map((a) => ({ start: a.starts_at, end: a.ends_at, companyName: a.company?.name ?? "another company" }));

  return (
    <div className="space-y-6">
      {back}
      <div className="flex items-center gap-4">
        <CompanyLogo name={context.company.name} path={context.company.logo_path} />
        <div>
          <p className="text-sm text-brand-700">Request an appointment</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{context.company.name}</h1>
        </div>
      </div>
      <Card>
        <CardBody className="py-6">
          <BookingForm
            context={context}
            zoneLabel={zoneLabel(now, context.timezone)}
            today={today}
            lastDay={addDays(today, BOOKING_RULES.maxAdvanceDays)}
            now={nowIso}
            initialMemberId={typeof member === "string" ? member : undefined}
            myUpcoming={upcoming}
          />
        </CardBody>
      </Card>
    </div>
  );
}
