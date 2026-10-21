import { formatDate } from "@/lib/format";
import type { Announcement } from "@/lib/floor/queries";

/**
 * Admin announcements running now. `floorNames` labels each one with the
 * floor it is for ("All floors" when it is building-wide).
 */
export function AnnouncementList({
  announcements,
  floorNames,
  className,
}: {
  announcements: Announcement[];
  floorNames?: Map<string, string>;
  className?: string;
}) {
  if (!announcements.length) return null;
  return (
    <ul aria-label="Announcements" className={className}>
      {announcements.map((a) => (
        <li
          key={a.id}
          className="flex gap-3 rounded-lg border border-accent-400/40 bg-accent-400/10 px-3 py-2 text-sm"
        >
          <svg
            viewBox="0 0 20 20"
            className="mt-0.5 size-4 shrink-0 text-accent-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M3 8v4a1 1 0 0 0 1 1h2l5 3V4L6 7H4a1 1 0 0 0-1 1zM14 7.5a3 3 0 0 1 0 5" />
          </svg>
          <div className="min-w-0">
            <p className="font-medium text-ink">{a.title}</p>
            {a.body && <p className="whitespace-pre-line text-muted">{a.body}</p>}
            <p className="mt-0.5 text-xs text-muted">
              {[
                floorNames ? (a.floor_id ? floorNames.get(a.floor_id) : "All floors") : null,
                a.ends_at ? `Until ${formatDate(a.ends_at, "datetime")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
