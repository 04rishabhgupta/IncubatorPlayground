import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { markAllNotificationsRead } from "@/lib/notifications/actions";
import { listNotifications } from "@/lib/notifications/queries";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireSession("/notifications");

  let notifications;
  try {
    notifications = await listNotifications();
  } catch (error) {
    unstable_rethrow(error);
    return <Alert tone="error">Couldn&apos;t load notifications. Please refresh the page.</Alert>;
  }
  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <>
      <PageHeader
        title="Notifications"
        action={
          hasUnread && (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="secondary">
                Mark all as read
              </Button>
            </form>
          )
        }
      />
      <Card>
        {notifications.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">You have no notifications.</p>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => {
              const content = (
                <div className="flex gap-3">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.read_at ? "bg-transparent" : "bg-brand-500",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm text-ink", !n.read_at && "font-semibold")}>
                      {n.title}
                      {!n.read_at && <span className="sr-only"> (unread)</span>}
                    </p>
                    {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                    <time className="mt-1 block text-xs text-muted" dateTime={n.created_at}>
                      {formatDate(n.created_at, "datetime")}
                    </time>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="block px-5 py-4 hover:bg-surface-muted">
                      {content}
                    </Link>
                  ) : (
                    <div className="px-5 py-4">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
