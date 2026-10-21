"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Table = "company_availability" | "member_availability" | "appointments" | "messages";

/**
 * Re-fetches the current page's server data when rows in the given tables
 * change (Supabase Realtime "postgres_changes"). The event is only used as a
 * signal: the refreshed data is read again on the server under RLS, so a
 * viewer never receives anything they couldn't already see.
 * Client state (selection, zoom, search) survives router.refresh().
 */
export function LiveRefresh({
  channel,
  tables,
  debounceMs = 400,
}: {
  channel: string;
  tables: Table[];
  debounceMs?: number;
}) {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return; // Supabase not configured; the page still works without live updates.
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = supabase.channel(`${channel}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(",")) {
      subscription.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), debounceMs);
      });
    }
    subscription.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(subscription);
    };
  }, [channel, key, debounceMs, router]);

  return null;
}
