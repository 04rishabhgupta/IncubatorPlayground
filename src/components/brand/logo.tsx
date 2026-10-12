import { siteConfig } from "@/config/site";

/** Wordmark with a small floor-plan glyph. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
        <rect x="1.5" y="1.5" width="21" height="21" rx="4" className="fill-brand-600" />
        <path d="M6 6h5v5H6zM13 6h5v5h-5zM6 13h5v5H6z" className="fill-white" />
        <path d="M13 13h5v5h-5z" className="fill-accent-400" />
      </svg>
      <span>{siteConfig.name}</span>
    </span>
  );
}
