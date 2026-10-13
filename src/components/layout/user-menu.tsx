import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { homeForRole } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

const dashboardLabel = { visitor: "My account", company: "Company dashboard", super_admin: "Admin" } as const;

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
  return (
    <nav className="flex items-center gap-1 sm:gap-2" aria-label="Account">
      <span className="hidden max-w-40 truncate text-sm text-muted md:inline" title={profile.email}>
        {profile.full_name || profile.email}
      </span>
      <ButtonLink href={homeForRole(profile.role)} variant="ghost" size="sm">
        {dashboardLabel[profile.role]}
      </ButtonLink>
      <Link
        href="/settings"
        className="hidden rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-ink sm:inline"
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
