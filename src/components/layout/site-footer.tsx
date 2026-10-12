import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-muted sm:px-6">{siteConfig.name}</div>
    </footer>
  );
}
