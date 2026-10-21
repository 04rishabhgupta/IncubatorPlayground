import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { FloorPlacement } from "@/components/admin/floor-placement";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getAdminFloorData } from "@/lib/floor/admin-queries";

export const metadata: Metadata = { title: "Floor layout · Admin" };

export default async function AdminFloorPage({ searchParams }: PageProps<"/admin/floor">) {
  await requireRole(["super_admin"], "/admin/floor");
  const params = await searchParams;
  const floorSlug = typeof params.floor === "string" ? params.floor : undefined;

  let result;
  try {
    result = await getAdminFloorData(floorSlug);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Admin floor failed to load", error);
    return <Alert tone="error">The floor couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title={result.status === "ok" ? `Floor layout · ${result.data.plan.floor.name}` : "Floor layout"}
        description="Place approved companies in vacant offices. Companies are notified whenever their office changes."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={`/admin/floor/editor${result.status === "ok" ? `?floor=${result.data.plan.floor.slug}` : ""}`}
              variant="secondary"
            >
              Edit layout
            </ButtonLink>
            <ButtonLink href="/admin/occupancy" variant="ghost">
              Occupancy
            </ButtonLink>
            <ButtonLink href="/admin/floor/preview" variant="ghost">
              Renderer preview
            </ButtonLink>
            <ButtonLink href="/admin" variant="secondary">
              Overview
            </ButtonLink>
          </div>
        }
      />
      {result.status === "ok" ? (
        <FloorPlacement data={result.data} />
      ) : (
        <Alert tone="error" title="No usable floor plan">
          {result.status === "no-floor"
            ? "No active floors exist yet."
            : `The floor data has problems: ${result.problems.join("; ")}`}
        </Alert>
      )}
    </>
  );
}
