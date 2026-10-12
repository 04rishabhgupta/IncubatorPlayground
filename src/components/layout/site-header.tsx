import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-ink" aria-label="Startup Floor Connect home">
          <Logo />
        </Link>
        {/* Navigation (directory, sign in, dashboards) arrives with the auth and directory phases. */}
      </div>
    </header>
  );
}
