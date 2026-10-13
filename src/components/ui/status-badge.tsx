import { cn } from "@/lib/cn";
import type { Enums } from "@/types/database";

type CompanyStatus = Enums<"company_status">;

const companyStatus: Record<CompanyStatus, { label: string; className: string }> = {
  pending: { label: "Pending review", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Approved", className: "bg-green-50 text-green-800 ring-green-200" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-800 ring-red-200" },
  suspended: { label: "Suspended", className: "bg-slate-100 text-slate-700 ring-slate-300" },
};

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const { label, className } = companyStatus[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      {label}
    </span>
  );
}
