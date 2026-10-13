import { cn } from "@/lib/cn";
import type { AppointmentStatus } from "@/lib/appointments/queries";

const styles: Record<AppointmentStatus | "expired", { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  accepted: { label: "Accepted", className: "bg-green-50 text-green-800 ring-green-200" },
  rejected: { label: "Declined", className: "bg-red-50 text-red-800 ring-red-200" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-700 ring-slate-300" },
  completed: { label: "Completed", className: "bg-brand-50 text-brand-800 ring-brand-200" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-600 ring-slate-300" },
};

/** "Expired" = a pending request whose time has passed without an answer. */
export function AppointmentStatusBadge({ status, ended }: { status: AppointmentStatus; ended?: boolean }) {
  const style = styles[status === "pending" && ended ? "expired" : status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}
