"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Industry = { slug: string; name: string };

/**
 * Search box + industry filter that keep their state in the URL, so results
 * are shareable and the page also works as a plain GET form without JS.
 */
export function DirectoryFilters({ industries }: { industries: Industry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const industry = searchParams.get("industry") ?? "";
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  function apply(next: { q?: string; industry?: string }) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  useEffect(() => () => clearTimeout(debounce.current), []);

  return (
    <form
      role="search"
      action={pathname}
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(debounce.current);
        apply({ q: q.trim() });
      }}
    >
      <label htmlFor="q" className="sr-only">
        Search companies by name
      </label>
      <input
        id="q"
        name="q"
        type="search"
        value={q}
        placeholder="Search companies by name"
        autoComplete="off"
        maxLength={100}
        onChange={(event) => {
          const value = event.target.value;
          setQ(value);
          clearTimeout(debounce.current);
          debounce.current = setTimeout(() => apply({ q: value.trim() }), 300);
        }}
        className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      <label htmlFor="industry" className="sr-only">
        Filter by industry
      </label>
      <select
        id="industry"
        name="industry"
        value={industry}
        onChange={(event) => apply({ industry: event.target.value })}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:w-64"
      >
        <option value="">All industries</option>
        {industries.map((i) => (
          <option key={i.slug} value={i.slug}>
            {i.name}
          </option>
        ))}
      </select>
      <span aria-live="polite" className="sr-only">
        {pending ? "Updating results" : ""}
      </span>
    </form>
  );
}
