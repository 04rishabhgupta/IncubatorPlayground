"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ButtonLink } from "@/components/ui/button";
import type { FloorPlan, FloorSummary } from "@/lib/floor/queries";

export type BuildingPanelProps = {
  building: FloorPlan["building"];
  floors: FloorSummary[];
  currentFloorSlug: string;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Building Overview modal panel: displays building details, address,
 * timezone, active floors, taglines, and navigation across the incubator.
 */
export function BuildingPanel({ building, floors, currentFloorSlug, isOpen, onClose }: BuildingPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus the dialog when it opens and give focus back to the button that opened it when it closes.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="building-panel-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" />
              </svg>
            </div>
            <div>
              <h2 id="building-panel-title" className="text-xl font-bold text-ink">
                {building?.name || "Incubator Building"}
              </h2>
              <p className="text-xs text-muted">
                {[building?.address, building?.timezone].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close building overview"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section aria-labelledby="floors-overview-heading">
            <div className="flex items-center justify-between mb-3">
              <h3
                id="floors-overview-heading"
                className="text-sm font-semibold uppercase tracking-wider text-muted"
              >
                Floors &amp; Facilities
              </h3>
              <span className="text-xs text-muted">
                {floors.length} active {floors.length === 1 ? "floor" : "floors"}
              </span>
            </div>

            <div className="space-y-3">
              {floors.map((floor) => {
                const isCurrent = floor.slug === currentFloorSlug;
                return (
                  <div
                    key={floor.id}
                    className={`group relative rounded-xl border p-4 transition-colors ${
                      isCurrent
                        ? "border-brand-500 bg-brand-50/30"
                        : "border-border bg-surface hover:border-brand-300 hover:bg-surface-muted"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{floor.name}</span>
                          <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                            Level {floor.level}
                          </span>
                          {isCurrent && (
                            <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                              Currently viewing
                            </span>
                          )}
                        </div>
                        {floor.tagline && (
                          <p className="text-sm font-medium text-brand-700">{floor.tagline}</p>
                        )}
                        {floor.description && (
                          <p className="text-xs text-muted leading-relaxed">{floor.description}</p>
                        )}
                      </div>

                      <div>
                        {isCurrent ? (
                          <span className="inline-flex h-8 items-center px-3 text-xs font-medium text-muted">
                            Viewing
                          </span>
                        ) : (
                          <Link
                            href={`/?floor=${floor.slug}`}
                            onClick={onClose}
                            className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-muted hover:border-brand-300"
                          >
                            Explore floor
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Quick info & Directory Link */}
          <div className="rounded-xl border border-dashed border-border bg-surface-muted/50 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              Directory &amp; Startups
            </h4>
            <p className="text-xs text-muted mb-3">
              Browse all approved startups, incubation founders, and teams across all floors of the incubator.
            </p>
            <ButtonLink href="/directory" variant="secondary" size="sm" onClick={onClose}>
              Browse Full Directory
            </ButtonLink>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border bg-surface-muted/30 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
