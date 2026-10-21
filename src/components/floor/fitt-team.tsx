import { AvailabilityBadge } from "@/components/company/availability-badge";
import type { IncubatorStaff } from "@/lib/floor/queries";

/** The FITT Incubation Team: who to ask at reception, with how to reach them. */
export function FittTeamList({ staff, headingId }: { staff: IncubatorStaff[]; headingId: string }) {
  if (!staff.length) return null;
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-semibold text-ink">
        FITT Incubation Team
      </h3>
      <p className="text-xs text-muted">The incubator&apos;s own team, here to help startups and visitors.</p>
      <ul className="mt-2 space-y-3">
        {staff.map((member) => (
          <li key={member.id} className="space-y-0.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{member.full_name}</span>
                {member.job_title && (
                  <span className="block truncate text-xs text-muted">{member.job_title}</span>
                )}
              </span>
              <AvailabilityBadge availability={member.availability} />
            </div>
            {(member.email || member.phone) && (
              <p className="flex flex-wrap gap-x-3 text-xs">
                {member.email && (
                  <a href={`mailto:${member.email}`} className="break-all text-brand-700 hover:underline">
                    {member.email}
                  </a>
                )}
                {member.phone && (
                  <a
                    href={`tel:${member.phone.replace(/\s/g, "")}`}
                    className="text-brand-700 hover:underline"
                  >
                    {member.phone}
                  </a>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
