"use client";

import { cn } from "@/lib/cn";

const buttonClass =
  "flex size-9 items-center justify-center text-ink hover:bg-surface-muted disabled:text-muted/50 disabled:hover:bg-transparent";

export function MapControls({
  zoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  onReset,
  className,
}: {
  zoom: number;
  maxZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Map zoom"
      className={cn(
        "flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={onZoomIn}
        disabled={zoom >= maxZoom - 0.01}
        aria-label="Zoom in"
      >
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={onZoomOut}
        disabled={zoom <= 1.01}
        aria-label="Zoom out"
      >
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
          <path d="M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={onReset}
        disabled={zoom <= 1.01}
        aria-label="Show whole floor"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function MapLegend({ className }: { className?: string }) {
  const items = [
    ["Available", "bg-status-available"],
    ["Busy", "bg-status-busy"],
    ["Unavailable", "bg-status-unavailable"],
    ["Unknown", "bg-status-unknown"],
  ] as const;
  return (
    <ul
      aria-label="Availability legend"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-sm",
        className,
      )}
    >
      {items.map(([label, dot]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
          {label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border border-dashed border-muted" aria-hidden="true" />
        Vacant
      </li>
    </ul>
  );
}
