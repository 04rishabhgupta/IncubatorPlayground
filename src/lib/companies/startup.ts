import type { Enums } from "@/types/database";

/** Startup profile labels, shared by forms, cards and filters (safe in client code). */

export type StartupStage = Enums<"startup_stage">;

export const STARTUP_STAGES: Array<{ value: StartupStage; label: string }> = [
  { value: "idea", label: "Idea" },
  { value: "prototype", label: "Prototype" },
  { value: "mvp", label: "MVP" },
  { value: "early_revenue", label: "Early revenue" },
  { value: "growth", label: "Growth" },
];

export function stageLabel(stage: StartupStage | null | undefined) {
  return STARTUP_STAGES.find((s) => s.value === stage)?.label ?? null;
}

export function teamSizeLabel(size: number | null | undefined) {
  if (!size) return null;
  return size === 1 ? "1 person" : `${size} people`;
}
