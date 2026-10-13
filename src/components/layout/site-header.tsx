import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { UserMenu, UserMenuFallback } from "./user-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-6">
          <Link href="/" className="shrink-0 text-ink" aria-label="Startup Floor Connect home">
            <Logo className="[&>span:last-child]:hidden lg:[&>span:last-child]:inline" />
          </Link>
          <nav aria-label="Main">
            <Link
              href="/directory"
              className="rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-ink sm:px-3"
            >
              Directory
            </Link>
          </nav>
        </div>
        <Suspense fallback={<UserMenuFallback />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
