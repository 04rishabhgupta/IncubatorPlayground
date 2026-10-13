import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CompanyCard } from "@/components/company/company-card";
import { DirectoryFilters } from "@/components/directory/directory-filters";
import { Alert } from "@/components/ui/alert";
import { listDirectoryCompanies, listIndustries } from "@/lib/companies/queries";

export const metadata: Metadata = {
  title: "Company directory",
  description: "Search the startups and companies working on the floor.",
};

export default function DirectoryPage({ searchParams }: PageProps<"/directory">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Company directory</h1>
        <p className="mt-2 text-muted">Find the companies on the floor by name or industry.</p>
      </div>
      <Suspense fallback={<DirectorySkeleton />}>
        <DirectoryResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DirectoryResults({ searchParams }: Pick<PageProps<"/directory">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const industry = typeof params.industry === "string" ? params.industry : "";

  let industries, companies;
  try {
    [industries, companies] = await Promise.all([
      listIndustries(),
      listDirectoryCompanies({ q: q || undefined, industry: industry || undefined }),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Directory failed to load", error);
    return (
      <Alert tone="error" title="The directory couldn't be loaded">
        Please refresh the page or try again in a moment.
      </Alert>
    );
  }

  const filtered = Boolean(q || industry);
  return (
    <div className="space-y-6">
      <DirectoryFilters industries={industries} />
      <p className="text-sm text-muted" aria-live="polite">
        {companies.length === 1 ? "1 company" : `${companies.length} companies`}
        {filtered ? " match your search" : " on the floor"}
      </p>
      {companies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-medium text-ink">
            {filtered ? "No companies match your search." : "No companies yet."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {filtered
              ? "Try a different name or clear the industry filter."
              : "Approved companies will appear here."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading companies">
      <div className="h-10 rounded-lg bg-surface-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-40 rounded-xl bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}
