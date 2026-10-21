"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { validateLayoutDocument, type Problem } from "@/lib/floor/layout-document";
import { createClient } from "@/lib/supabase/server";

export type SaveLayoutState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Problem[];
  /** The layout's new version stamp, so the next save from this page isn't seen as stale. */
  updatedAt?: string;
};

const inputSchema = z.object({
  floorId: z.uuid(),
  document: z.string().max(2_000_000, "The document is too large."),
  note: z.string().trim().max(200, "Keep the note under 200 characters.").optional().default(""),
  expectedUpdatedAt: z.string().min(1),
});

/**
 * Save the layout editor's document. Validated here with the same rules as
 * the live preview, then applied by save_floor_layout(), which also refuses a
 * save made from an outdated copy and records the version.
 */
export async function saveFloorLayout(_prev: SaveLayoutState, formData: FormData): Promise<SaveLayoutState> {
  const session = await getSession();
  if (session?.profile.role !== "super_admin") {
    return { status: "error", message: "Only the platform admin can edit floor layouts." };
  }
  const input = inputSchema.safeParse(Object.fromEntries(formData));
  if (!input.success)
    return { status: "error", message: input.error.issues[0]?.message ?? "Invalid request." };
  const { floorId, document, note, expectedUpdatedAt } = input.data;

  const supabase = await createClient();
  const { data: spaces, error: spacesError } = await supabase
    .from("floor_spaces")
    .select("code")
    .eq("floor_id", floorId);
  if (spacesError) return { status: "error", message: "The floor couldn't be loaded. Please try again." };

  const result = validateLayoutDocument(
    document,
    spaces.map((s) => s.code),
  );
  if (!result.document) {
    return { status: "error", message: "Fix the errors before saving.", errors: result.errors };
  }

  const { data: updatedAt, error } = await supabase.rpc("save_floor_layout", {
    p_floor_id: floorId,
    p_document: result.document,
    p_note: note,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    if (error.code === "40001") {
      return {
        status: "error",
        message:
          "Someone saved this floor after you opened it. Copy your changes, reload the page, and apply them again.",
      };
    }
    console.error("Layout save failed", error);
    return { status: "error", message: error.message || "The layout couldn't be saved." };
  }

  revalidatePath("/");
  revalidatePath("/admin/floor");
  revalidatePath("/admin/floor/editor");
  revalidatePath("/admin/occupancy");
  return {
    status: "success",
    message: result.warnings.length
      ? `Layout saved, with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}.`
      : "Layout saved. Visitors see it now.",
    updatedAt: updatedAt ?? undefined,
  };
}
