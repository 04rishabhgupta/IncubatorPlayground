import Image from "next/image";
import { cn } from "@/lib/cn";
import { publicStorageUrl } from "@/lib/format";

const sizes = { sm: 40, md: 56, lg: 96 } as const;

/** Company logo from Storage, or the company's initial as a fallback. */
export function CompanyLogo({
  name,
  path,
  size = "md",
  className,
}: {
  name: string;
  path: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const px = sizes[size];
  const url = publicStorageUrl("company-logos", path);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface",
        className,
      )}
      style={{ width: px, height: px }}
    >
      {url ? (
        <Image
          src={url}
          alt={`${name} logo`}
          width={px}
          height={px}
          className="size-full object-contain p-1"
        />
      ) : (
        <span
          className={cn("font-semibold text-brand-700", size === "lg" ? "text-3xl" : "text-lg")}
          aria-hidden="true"
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
