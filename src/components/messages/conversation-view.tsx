"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { loadEarlierMessages, markConversationRead, sendMessage } from "@/lib/messages/actions";
import type { ChatMessage } from "@/lib/messages/queries";
import { createClient } from "@/lib/supabase/client";

/**
 * One conversation: history, live delivery, "Seen" and the composer.
 *
 * New messages arrive through Supabase Realtime (Postgres changes on
 * `messages` for this conversation). Realtime applies the same RLS as reads,
 * so only the two members ever receive them. The other member's read state
 * arrives the same way (`conversation_members`) and drives "Seen".
 */
export function ConversationView({
  conversationId,
  myId,
  otherName,
  initialMessages,
  initialHasMore,
  initialOtherReadAt,
}: {
  conversationId: string;
  myId: string;
  otherName: string;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  initialOtherReadAt: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [otherReadAt, setOtherReadAt] = useState(initialOtherReadAt);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [sending, startSending] = useTransition();
  const [loadingEarlier, startLoadingEarlier] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);

  const add = (incoming: ChatMessage[]) =>
    setMessages((current) => {
      const known = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length
        ? [...current, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at))
        : current;
    });

  // Opening the conversation reads it.
  useEffect(() => {
    void markConversationRead(conversationId);
  }, [conversationId]);

  // Live delivery and read receipts.
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return; // not configured: the page still works, without live updates
    }
    const channel = supabase
      .channel(`conversation:${conversationId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage & { conversation_id: string };
          add([{ id: m.id, sender_id: m.sender_id, body: m.body, created_at: m.created_at }]);
          if (m.sender_id !== myId && document.visibilityState === "visible") {
            void markConversationRead(conversationId);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as { profile_id: string; last_read_at: string | null };
          if (row.profile_id !== myId) setOtherReadAt(row.last_read_at);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, myId]);

  // Coming back to the tab reads what arrived meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void markConversationRead(conversationId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversationId]);

  // Keep the newest message in view unless the reader has scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setError(null);
    startSending(async () => {
      const result = await sendMessage(conversationId, body);
      if (result.ok) {
        add([result.message]);
        setDraft("");
        stickToBottom.current = true;
      } else {
        setError(result.error);
      }
    });
  }

  // Enter sends; Shift+Enter adds a line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function loadEarlier() {
    const oldest = messages[0];
    if (!oldest) return;
    const el = listRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    stickToBottom.current = false;
    startLoadingEarlier(async () => {
      const result = await loadEarlierMessages(conversationId, oldest.created_at);
      setMessages((current) => [...result.messages, ...current]);
      setHasMore(result.hasMore);
      // Keep the reader's place after older messages are added above.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
      });
    });
  }

  const lastMine = [...messages].reverse().find((m) => m.sender_id === myId);
  const seen = lastMine && otherReadAt && otherReadAt >= lastMine.created_at;

  return (
    <div className="flex h-[calc(100svh-16rem)] min-h-[420px] flex-col rounded-xl border border-border bg-surface">
      <ol
        ref={listRef}
        aria-label={`Messages with ${otherName}`}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
      >
        {hasMore && (
          <li className="text-center">
            <Button variant="ghost" size="sm" onClick={loadEarlier} disabled={loadingEarlier}>
              {loadingEarlier ? "Loading…" : "Load earlier messages"}
            </Button>
          </li>
        )}
        {messages.length === 0 && (
          <li className="py-10 text-center text-sm text-muted">No messages yet. Say hello to {otherName}.</li>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === myId;
          const day = formatDate(m.created_at);
          const newDay = i === 0 || formatDate(messages[i - 1].created_at) !== day;
          return (
            <li key={m.id} className="space-y-2">
              {newDay && <p className="pt-2 text-center text-xs text-muted">{day}</p>}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    mine
                      ? "rounded-br-sm bg-brand-600 text-white"
                      : "rounded-bl-sm bg-surface-muted text-ink",
                  )}
                >
                  <span className="sr-only">{mine ? "You" : otherName}: </span>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-0.5 text-right text-[11px]", mine ? "text-white/75" : "text-muted")}>
                    <time dateTime={m.created_at}>{formatDate(m.created_at, "time")}</time>
                  </p>
                </div>
              </div>
              {m === lastMine && seen && <p className="text-right text-xs text-muted">Seen</p>}
            </li>
          );
        })}
      </ol>

      <form onSubmit={send} className="space-y-2 border-t border-border p-3">
        {error && <Alert tone="error">{error}</Alert>}
        <label htmlFor="message-draft" className="sr-only">
          Message {otherName}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="message-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={4000}
            placeholder={`Message ${otherName}`}
            className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Enter to send, Shift+Enter for a new line.{" "}
          {live ? "Messages arrive live." : "Connecting for live updates…"}
        </p>
      </form>
    </div>
  );
}
