import type { Metadata } from "next";
import { AnnouncementActions, AnnouncementForm } from "@/components/admin/incubator-forms";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Announcements · Admin" };

type Status = "running" | "scheduled" | "ended";
const statusStyle: Record<Status, string> = {
  running: "bg-green-50 text-green-800",
  scheduled: "bg-brand-50 text-brand-800",
  ended: "bg-surface-muted text-muted",
};

export default async function AnnouncementsPage() {
  await requireRole(["super_admin"], "/admin/announcements");
  const supabase = await createClient();
  const [announcementsRes, floorsRes] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, body, floor_id, starts_at, ends_at, created_at")
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase.from("floors").select("id, name").order("level"),
  ]);

  const floors = floorsRes.data ?? [];
  const floorName = new Map(floors.map((f) => [f.id, f.name]));
  const now = new Date();
  const status = (a: { starts_at: string; ends_at: string | null }): Status =>
    new Date(a.starts_at) > now ? "scheduled" : a.ends_at && new Date(a.ends_at) <= now ? "ended" : "running";
  const order: Record<Status, number> = { running: 0, scheduled: 1, ended: 2 };
  const announcements = [...(announcementsRes.data ?? [])].sort(
    (a, b) => order[status(a)] - order[status(b)],
  );

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Announcements"
        description="Notices shown above the floor map and in the building overview while they run."
        action={
          <ButtonLink href="/admin" variant="secondary">
            Overview
          </ButtonLink>
        }
      />
      {announcementsRes.error || floorsRes.error ? (
        <Alert tone="error">Announcements couldn&apos;t be loaded. Please refresh the page.</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card className="self-start">
            <CardHeader title="All announcements" />
            <CardBody>
              {announcements.length === 0 ? (
                <p className="text-sm text-muted">Nothing posted yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {announcements.map((a) => {
                    const s = status(a);
                    return (
                      <li key={a.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${statusStyle[s]}`}
                          >
                            {s}
                          </span>
                          <span className="font-medium text-ink">{a.title}</span>
                        </div>
                        {a.body && <p className="whitespace-pre-line text-sm text-muted">{a.body}</p>}
                        <p className="text-xs text-muted">
                          {a.floor_id ? (floorName.get(a.floor_id) ?? "A removed floor") : "Every floor"} ·{" "}
                          {formatDate(a.starts_at, "datetime")}
                          {a.ends_at ? ` – ${formatDate(a.ends_at, "datetime")}` : " onwards"}
                        </p>
                        {s !== "ended" && <AnnouncementActions id={a.id} running={s === "running"} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card className="self-start">
            <CardHeader title="New announcement" />
            <CardBody>
              <AnnouncementForm floors={floors} />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
