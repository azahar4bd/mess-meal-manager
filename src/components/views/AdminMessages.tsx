"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { Card, EmptyState, Loader, Modal } from "@/components/ui";
import { MessageBubble } from "@/components/SupportChat";
import { mess } from "@/lib/client";
import { toDisplayDateTime } from "@/lib/date";
import { ROLE_LABEL } from "@/lib/permissions";
import type { SupportMessageDTO, SupportThread } from "@/lib/types";

/**
 * অ্যাডমিন ইনবক্স — ম্যানেজার/সদস্য/অফিস থেকে আসা বার্তা দেখা ও উত্তর দেওয়া।
 */
export function AdminMessages({ onUnreadChange }: { onUnreadChange?: (n: number) => void }) {
  const app = useApp();
  const [threads, setThreads] = useState<SupportThread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessageDTO[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await mess<SupportThread[]>("support.threads");
      const list = Array.isArray(res) ? res : [];
      setThreads(list);
      const unread = list.reduce((s, t) => s + t.unread, 0);
      onUnreadChange?.(unread);
    } catch {
      setThreads([]);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void loadThreads();
    const t = setInterval(() => void loadThreads(), 30000);
    return () => clearInterval(t);
  }, [loadThreads]);

  const openThread = useCallback(
    async (userId: string) => {
      setActiveId(userId);
      setMessages([]);
      try {
        const res = await mess<SupportMessageDTO[]>("support.thread", { userId });
        setMessages(Array.isArray(res) ? res : []);
      } catch {
        setMessages([]);
      }
      await loadThreads();
    },
    [loadThreads],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeId]);

  const send = async () => {
    const body = text.trim();
    if (!activeId || body.length < 2 || sending) return;
    setSending(true);
    try {
      const msg = await mess<SupportMessageDTO>("support.reply", { userId: activeId, message: body });
      if (msg) setMessages((p) => [...p, msg]);
      setText("");
      await loadThreads();
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "উত্তর পাঠানো যায়নি", "error");
    } finally {
      setSending(false);
    }
  };

  if (!threads) return <Loader label="বার্তা লোড হচ্ছে…" />;
  if (threads.length === 0) {
    return <EmptyState icon="💬" title="কোনো বার্তা নেই" hint="কোনো ম্যানেজার বা সদস্য বার্তা পাঠালে এখানে দেখা যাবে।" />;
  }

  const active = threads.find((t) => t.userId === activeId);

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      {/* ── থ্রেড তালিকা ── */}
      <Card bodyClass="p-0" className={activeId ? "hidden lg:block" : ""}>
        <div className="max-h-[70vh] divide-y divide-[var(--border)] overflow-y-auto">
          {threads.map((t) => (
            <button
              key={t.userId}
              type="button"
              onClick={() => void openThread(t.userId)}
              className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition ${
                activeId === t.userId ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--card-alt)]"
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[13px] font-bold text-white">
                {(t.userName || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-bold">{t.userName || t.userId}</span>
                  <span className="muted shrink-0 text-[10.5px]">{toDisplayDateTime(t.lastAt)}</span>
                </span>
                <span className="muted block truncate text-[11.5px]">
                  {t.officeName ? `${t.officeName} • ` : ""}
                  {ROLE_LABEL[t.role as keyof typeof ROLE_LABEL]?.bn ?? t.role}
                </span>
                <span className="block truncate text-[12px]">
                  {t.lastSender === "admin" ? "আপনি: " : ""}
                  {t.lastBody}
                </span>
              </span>
              {t.unread > 0 ? (
                <span className="grid h-5 min-w-[20px] shrink-0 place-items-center self-center rounded-full bg-[var(--danger)] px-1 text-[10.5px] font-extrabold text-white">
                  {t.unread > 9 ? "9+" : t.unread}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </Card>

      {/* ── কথোপকথন ── */}
      <Card bodyClass="p-0" className={activeId ? "" : "hidden lg:block"}>
        {!active ? (
          <div className="p-6">
            <EmptyState icon="👈" title="একটি কথোপকথন বেছে নিন" />
          </div>
        ) : (
          <div className="flex h-[70vh] flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
              <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={() => setActiveId(null)}>
                ‹
              </button>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-bold">{active.userName || active.userId}</div>
                <div className="muted truncate text-[11px]">
                  {active.officeName ? `${active.officeName} • ` : ""}
                  {ROLE_LABEL[active.role as keyof typeof ROLE_LABEL]?.bn ?? active.role} • {active.userId}
                </div>
              </div>
            </div>
            <div className="modal-scroll flex-1 space-y-2 overflow-y-auto bg-[var(--bg)] p-2.5">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} mine={false} />
              ))}
              <div ref={endRef} />
            </div>
            <div className="flex items-end gap-2 border-t border-[var(--border)] p-2.5">
              <textarea
                className="input min-h-[42px] flex-1 resize-none py-2 text-[14px]"
                rows={2}
                maxLength={2000}
                placeholder="উত্তর লিখুন…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button type="button" className="btn btn-primary h-11 px-4" disabled={sending || text.trim().length < 2} onClick={() => void send()}>
                {sending ? "…" : "উত্তর"}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  অ্যাডমিনের ভাসমান 💬 বাটন — যেকোনো পেজ থেকে ইনবক্স
 * ══════════════════════════════════════════════════════════ */

export function AdminChatButton() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (app.role !== "admin") return;
    try {
      const res = await mess<{ messages?: number; count?: number }>("support.unread");
      setUnread(res.messages ?? res.count ?? 0);
    } catch {
      /* নীরবে */
    }
  }, [app.role]);

  useEffect(() => {
    if (app.role !== "admin") return;
    void refresh();
    const t = setInterval(() => void refresh(), 45000);
    return () => clearInterval(t);
  }, [app.role, refresh]);

  if (app.role !== "admin") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="বার্তা ইনবক্স"
        aria-label="চ্যাট ইনবক্স খুলুন"
        className="fixed bottom-[74px] left-3 z-40 inline-flex items-center gap-1.5 rounded-full p-3 text-white shadow-lg shadow-black/20 transition hover:brightness-110 sm:bottom-5"
        style={{ background: "linear-gradient(135deg,#0d9488 0%,var(--brand) 55%,#059669 100%)" }}
      >
        <span className="text-[18px]" aria-hidden>
          💬
        </span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-[var(--danger)] px-1 text-[10.5px] font-extrabold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      <Modal open={open} title="💬 বার্তা ইনবক্স" onClose={() => setOpen(false)} wide>
        <AdminMessages key={open ? "open" : "closed"} />
      </Modal>
    </>
  );
}
