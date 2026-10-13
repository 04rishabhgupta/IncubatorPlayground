import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { AvailabilityStatus } from "@/lib/companies/queries";

const styles: Record<AvailabilityStatus | "unknown", { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-status-available" },
  busy: { label: "Busy", dot: "bg-status-busy" },
  unavailable: { label: "Unavailable", dot: "bg-status-unavailable" },
  unknown: { label: "Unknown", dot: "bg-status-unknown" },
};

/**
 * Self-reported availability. Always shown with a text label (not colour
 * alone) and, when known, when it was last updated. It never implies a
 * confirmed meeting slot or physical presence.
 */
export function AvailabilityBadge({
  availability,
  showUpdated = false,
  className,
}: {
  availability: { status: AvailabilityStatus; updated_at: string } | null;
  showUpdated?: boolean;
  className?: string;
}) {
  const style = styles[availability?.status ?? "unknown"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted", className)}>
      <span className={cn("size-2 rounded-full", style.dot)} aria-hidden="true" />
      <span className="font-medium text-ink">{style.label}</span>
      {showUpdated && availability && (
        <span>
          · updated{" "}
          <time dateTime={availability.updated_at}>{formatDate(availability.updated_at, "datetime")}</time>
        </span>
      )}
    </span>
  );
}
