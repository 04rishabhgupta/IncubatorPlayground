import type { Metadata } from "next";
import { FloorPreview } from "@/components/admin/floor-preview";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { demoFloorPlan } from "@/lib/floor/samples/demo-floor";

export const metadata: Metadata = { title: "Renderer preview · Admin" };

export default async function FloorPreviewPage() {
  await requireRole(["super_admin"], "/admin/floor/preview");

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Floor renderer preview"
        description="How the floor plan renderer draws walls, doors, windows and furniture."
        action={
          <ButtonLink href="/admin/floor" variant="secondary">
            Back to floor layout
          </ButtonLink>
        }
      />
      <div className="mb-6">
        <Alert tone="info" title="Sample data only">
          This preview uses a built-in sample layout and sample companies. It is not saved and visitors never
          see it. The real floor plan is unchanged.
        </Alert>
      </div>
      <FloorPreview plan={demoFloorPlan} />
    </>
  );
}
