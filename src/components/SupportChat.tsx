"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { Modal } from "@/components/ui";
import { mess } from "@/lib/client";
import { toDisplayDateTime } from "@/lib/date";
import type { SupportMessageDTO } from "@/lib/types";

/* ══════════════════════════════════════════════════════════
 *  বার্তার বুদবুদ — ব্যবহারকারীর বার্তা ডানে (brand), অ্যাডমিনের বাঁয়ে
 * ══════════════════════════════════════════════════════════ */

export function MessageBubble({ m, mine }: { m: SupportMessageDTO; mine: boolean }) {
  const fromMe = mine ? m.sender === "user" : m.sender === "admin";
  return (
    <div className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug shadow-sm ${
          fromMe ? "rounded-br-sm text-white" : "rounded-bl-sm border border-[var(--border)] bg-[var(--card)]"
        }`}
        style={fromMe ? { background: "linear-gradient(135deg,#0d9488 0%,var(--brand) 60%,#059669 100%)" } : undefined}
      >
        <div className="whitespace-pre-wrap break-words">{m.body}</div>
        <div className={`mt-0.5 text-[10px] ${fromMe ? "text-white/75" : "muted"}`}>{toDisplayDateTime(m.at)}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  ব্যবহারকারীর দরজা — ভাসমান 💬 বাটন (অ্যাডমিন ছাড়া সবার জন্য)
 * ══════════════════════════════════════════════════════════ */

export function SupportChatButton() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await mess<{ count: number }>("support.unread");
      setUnread(res.count ?? 0);
    } catch {
      /* নীরবে উপেক্ষা */
    }
  }, []);

  useEffect(() => {
    if (app.role === "admin") return;
    void refreshUnread();
    const t = setInterval(() => void refreshUnread(), 45000);
    return () => clearInterval(t);
  }, [app.role, refreshUnread]);

  if (app.role === "admin") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="অ্যাডমিনকে বার্তা পাঠান"
        aria-label="চ্যাট খুলুন"
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
      <UserChat open={open} onClose={() => setOpen(false)} onChanged={refreshUnread} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════
 *  ব্যবহারকারীর চ্যাট উইন্ডো
 * ══════════════════════════════════════════════════════════ */

export function UserChat({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: () => void }) {
  const app = useApp();
  const [messages, setMessages] = useState<SupportMessageDTO[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mess<SupportMessageDTO[]>("support.mine");
      setMessages(Array.isArray(res) ? res : []);
      onChanged?.();
    } catch {
      /* নীরবে */
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, open]);

  const send = async () => {
    const body = text.trim();
    if (body.length < 2 || sending) return;
    setSending(true);
    try {
      const msg = await mess<SupportMessageDTO>("support.send", { message: body });
      if (msg) setMessages((p) => [...p, msg]);
      setText("");
      onChanged?.();
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "বার্তা পাঠানো যায়নি", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} title="💬 অ্যাডমিনের সাথে চ্যাট" onClose={onClose}>
      <div className="flex h-[54vh] flex-col">
        <div className="modal-scroll -mx-1 flex-1 space-y-2 overflow-y-auto bg-[var(--bg)] p-2">
          {loading && messages.length === 0 ? (
            <div className="muted py-8 text-center text-[12.5px]">লোড হচ্ছে…</div>
          ) : messages.length === 0 ? (
            <div className="muted py-10 text-center text-[12.5px]">
              কোনো সমস্যা, পরামর্শ বা তথ্য জানাতে চাইলে নিচে লিখে পাঠান —<br />
              অ্যাডমিন উত্তর দিলে এখানেই দেখতে পাবেন।
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} m={m} mine />)
          )}
          <div ref={endRef} />
        </div>
        <div className="mt-2 flex items-end gap-2">
          <textarea
            className="input min-h-[44px] flex-1 resize-none py-2 text-[14px]"
            rows={2}
            maxLength={2000}
            placeholder="আপনার বার্তা লিখুন…"
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
            {sending ? "…" : "পাঠান"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
