import type { Metadata } from "next";
import Link from "next/link";
import { RoleForm } from "@/components/admin/role-form";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { roleLabels, type AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users · Admin" };

const PAGE_SIZE = 50;
const roleStyle: Record<AppRole, string> = {
  visitor: "bg-surface-muted text-muted",
  company: "bg-brand-50 text-brand-800",
  super_admin: "bg-amber-50 text-amber-800",
};

/** Escape LIKE wildcards so the search matches literally. */
const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const session = await requireRole(["super_admin"], "/admin/users");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const role = typeof params.role === "string" && params.role in roleLabels ? (params.role as AppRole) : "";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : 1) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select(
      "id, email, full_name, role, created_at, company:companies!companies_owner_id_fkey(id, name, status)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`email.ilike.${likePattern(q)},full_name.ilike.${likePattern(q)}`);
  if (role) query = query.eq("role", role);
  const { data, count, error } = await query.overrideTypes<
    Array<{
      id: string;
      email: string;
      full_name: string;
      role: AppRole;
      created_at: string;
      company: { id: string; name: string; status: string } | null;
    }>,
    { merge: false }
  >();

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (changes: Record<string, string | number>) => {
    const next = new URLSearchParams({ ...(q && { q }), ...(role && { role }), page: String(page) });
    for (const [k, v] of Object.entries(changes)) next.set(k, String(v));
    return `/admin/users?${next}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Users"
        description="Everyone with an account. Make a visitor a platform admin, or remove admin rights. Company accounts stay company accounts while they own a company."
        action={
          <ButtonLink href="/admin" variant="secondary">
            Overview
          </ButtonLink>
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-64 flex-1 space-y-1 text-sm">
          <span className="font-medium text-ink">Search</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name or email"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-ink">Role</span>
          <select
            name="role"
            defaultValue={role}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink"
          >
            <option value="">All roles</option>
            {(Object.keys(roleLabels) as AppRole[]).map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      {error ? (
        <Alert tone="error">Users couldn&apos;t be loaded. Please refresh the page.</Alert>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted" aria-live="polite">
            {count ?? 0} {count === 1 ? "user" : "users"}
            {q || role ? " match" : ""}
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Joined</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2">
                      <span className="block text-ink">{u.full_name || "—"}</span>
                      <span className="block text-xs text-muted">{u.email}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", roleStyle[u.role])}>
                        {roleLabels[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {u.company ? (
                        <Link
                          href={`/admin/companies/${u.company.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {u.company.name}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-2">
                      {u.id === session.userId ? (
                        <span className="text-xs text-muted">You</span>
                      ) : u.role === "company" ? (
                        <span className="text-xs text-muted">Company account</span>
                      ) : (
                        <RoleForm userId={u.id} email={u.email} role={u.role} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={link({ page: page - 1 })} className="text-brand-700 hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={link({ page: page + 1 })} className="text-brand-700 hover:underline">
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
