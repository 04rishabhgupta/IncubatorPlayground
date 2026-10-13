import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { homeForRole } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/notifications/queries";

const dashboardLabel = { visitor: "My account", company: "Dashboard", super_admin: "Admin" } as const;

/** Session-aware header actions. Reads cookies, so it renders inside <Suspense>. */
export async function UserMenu() {
  const session = await getSession();

  if (!session) {
    return (
      <nav className="flex items-center gap-2" aria-label="Account">
        <ButtonLink href="/login" variant="ghost" size="sm">
          Sign in
        </ButtonLink>
        <ButtonLink href="/register" size="sm">
          Register
        </ButtonLink>
      </nav>
    );
  }

  const { profile } = session;
  const unread = await countUnreadNotifications();

  return (
    <nav className="flex items-center gap-1 sm:gap-2" aria-label="Account">
      <span className="hidden max-w-40 truncate text-sm text-muted lg:inline" title={profile.email}>
        {profile.full_name || profile.email}
      </span>
      <ButtonLink href={homeForRole(profile.role)} variant="ghost" size="sm">
        {dashboardLabel[profile.role]}
      </ButtonLink>
      <Link
        href="/notifications"
        className="relative rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-ink"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <Link
        href="/account/appointments"
        className="hidden rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-ink md:inline"
      >
        Appointments
      </Link>
      <Link
        href="/settings"
        className="hidden rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-ink md:inline"
      >
        Settings
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="secondary" size="sm">
          Sign out
        </Button>
      </form>
    </nav>
  );
}

export function UserMenuFallback() {
  return <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-muted" aria-hidden="true" />;
}
