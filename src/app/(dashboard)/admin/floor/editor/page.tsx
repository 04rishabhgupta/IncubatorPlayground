import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { LayoutEditor } from "@/components/admin/layout-editor";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getLayoutEditorData } from "@/lib/floor/editor-queries";

export const metadata: Metadata = { title: "Layout editor · Admin" };

export default async function LayoutEditorPage({ searchParams }: PageProps<"/admin/floor/editor">) {
  await requireRole(["super_admin"], "/admin/floor/editor");
  const params = await searchParams;
  const floorSlug = typeof params.floor === "string" ? params.floor : undefined;

  let data;
  try {
    data = await getLayoutEditorData(floorSlug);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Layout editor failed to load", error);
    return <Alert tone="error">The layout couldn&apos;t be loaded. Please refresh the page.</Alert>;
  }

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title={data ? `Layout editor · ${data.floor.name}` : "Layout editor"}
        description="Edit walls, doors, windows, furniture, areas and room shapes as JSON. Check the preview, then save; every save is kept in the history."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/floor/preview" variant="ghost">
              Furniture symbols
            </ButtonLink>
            <ButtonLink href={`/admin/floor${data ? `?floor=${data.floor.slug}` : ""}`} variant="secondary">
              Back to placement
            </ButtonLink>
          </div>
        }
      />
      {data ? (
        <LayoutEditor key={data.floor.id} data={data} />
      ) : (
        <Alert tone="warning" title="No floor layout">
          Add a floor and its layout first (see docs/ARCHITECTURE.md, “Adding or editing a floor”).
        </Alert>
      )}
    </>
  );
}
