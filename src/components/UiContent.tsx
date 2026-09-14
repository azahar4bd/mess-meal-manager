"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Modal, TextArea, TextInput } from "@/components/ui";
import { mess } from "@/lib/client";
import { useApp } from "@/components/app-context";
import { DEFAULT_TEXTS, type Notice, type UiTexts } from "@/lib/ui-content-types";

/* ══════════════════════════════════════════════════════════
 *  এডিটেবল টেক্সট + স্ক্রলিং নোটিশ বোর্ড (ক্লায়েন্ট অংশ)
 *  • useUiContent  — অফিস অনুযায়ী টেক্সট/নোটিশ লোড ও ক্যাশ
 *  • NoticeTicker  — বাম→ডান স্ক্রলিং নোটিশ (শুধু প্রেজেন্টেশন)
 *  • UiContentEditor — অ্যাডমিন (গ্লোবাল) / ম্যানেজার (অফিস) এডিটর
 * ══════════════════════════════════════════════════════════ */

type Content = { texts: UiTexts; notices: Notice[] };

let cache: Content | null = null;
let cacheOffice: string | null = null;
let inflight: Promise<Content | null> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

async function load(officeId?: string | null): Promise<Content | null> {
  const key = officeId ?? null;
  if (cache && cacheOffice === key) return cache;
  if (inflight) return inflight;
  inflight = mess<Content>("ui.content")
    .then((data) => {
      cache = data;
      cacheOffice = key;
      notify();
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** টেক্সট/নোটিশ রিফ্রেশ করে সব কনজিউমারকে জানায় (এডিট করার পরে ডাকা হয়) */
export async function refreshUiContent(officeId?: string | null): Promise<void> {
  cache = null;
  cacheOffice = null;
  await load(officeId);
}

export function useUiContent(officeId?: string | null) {
  const [content, setContent] = useState<Content | null>(cache);

  useEffect(() => {
    const fn = () => setContent(cache);
    listeners.add(fn);
    void load(officeId);
    return () => {
      listeners.delete(fn);
    };
  }, [officeId]);

  return {
    texts: content?.texts ?? DEFAULT_TEXTS,
    notices: content?.notices ?? [],
  };
}

/** শুধু প্রেজেন্টেশন — লগআউট স্ক্রিনেও ব্যবহার হয় (কোনো কনটেক্সট লাগে না) */
export function NoticeTicker({ notices, label = "📢 নোটিশ" }: { notices: Notice[]; label?: string }) {
  const list = notices.filter((n) => n.active !== false && n.text.trim());
  if (!list.length) return null;
  return (
    <div className="notice-ticker no-print">
      <span className="notice-ticker__label">{label}</span>
      <div className="notice-ticker__viewport">
        <div className="notice-ticker__track">
          {[...list, ...list].map((n, i) => (
            <span key={`${n.id}-${i}`} className="notice-ticker__item">
              {n.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** লগইন করা অ্যাপের ভেতরের টিকার — অফিস বদলালে নিজে থেকেই হালনাগাদ হয় */
export function AppNoticeTicker() {
  const app = useApp();
  const { notices } = useUiContent(app.office?.id ?? null);
  return <NoticeTicker notices={notices} />;
}

const TEXT_FIELDS: { key: keyof UiTexts; label: string; multiline?: boolean; officeOnly?: boolean }[] = [
  { key: "appName", label: "অ্যাপের নাম / App Name" },
  { key: "heroBadge", label: "Hero Badge (ব্র্যান্ডের নিচের লাইন)" },
  { key: "heroTitle", label: "Hero Title", multiline: true },
  { key: "heroDescription", label: "Hero Description", multiline: true },
  { key: "heroFeatures", label: "Hero Features (প্রতি লাইনে একটি)", multiline: true },
  { key: "dashboardTitle", label: "ড্যাশবোর্ড হেডার / Title" },
  { key: "dashboardSubtitle", label: "ড্যাশবোর্ড সাবটাইটেল (নিজের লেখা)", multiline: true },
];

export function UiContentEditor({
  open,
  onClose,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  scope: "global" | "office";
}) {
  const app = useApp();
  const [texts, setTexts] = useState<UiTexts>(DEFAULT_TEXTS);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    mess<{ texts: UiTexts; notices: Notice[] }>("ui.editor", { scope })
      .then((res) => {
        setTexts(res?.texts ?? DEFAULT_TEXTS);
        setNotices(res?.notices ?? []);
      })
      .catch(() => app.toast("এডিটযোগ্য কন্টেন্ট লোড করা যায়নি", "error"))
      .finally(() => setLoading(false));
  }, [open, scope, app]);

  const setField = useCallback((key: keyof UiTexts, value: string) => setTexts((p) => ({ ...p, [key]: value })), []);

  const addNotice = () => {
    const text = draft.trim();
    if (!text) return;
    setNotices((p) => [...p, { id: `new-${Date.now()}`, text: text.slice(0, 240), active: true, createdAt: new Date().toISOString() }].slice(0, 20));
    setDraft("");
  };

  const save = async () => {
    setBusy(true);
    try {
      await mess("ui.updateTexts", { scope, texts });
      await mess("ui.updateNotices", { scope, notices });
      await refreshUiContent(scope === "office" ? app.office?.id : null);
      app.toast(scope === "global" ? "গ্লোবাল টেক্সট ও নোটিশ হালনাগাদ হয়েছে ✓" : "অফিসের টেক্সট ও নোটিশ হালনাগাদ হয়েছে ✓", "success");
      onClose();
    } catch {
      app.toast("সংরক্ষণ করা যায়নি", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={scope === "global" ? "🎛 গ্লোবাল টেক্সট ও নোটিশ বোর্ড" : "🎛 অফিসের টেক্সট ও নোটিশ বোর্ড"}
      subtitle={scope === "global" ? "সব অফিসে ও লগইন পেজে দেখাবে" : "শুধু আপনার অফিসের জন্য (গ্লোবালকে ওভাররাইড করে)"}
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || loading}>
            {busy ? "সংরক্ষণ হচ্ছে…" : "💾 সেভ করুন"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="muted py-6 text-center text-[13px]">লোড হচ্ছে…</div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[13px] font-extrabold">📝 বিবরণ / টেক্সট</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TEXT_FIELDS.map((f) => (
                <label key={f.key} className={f.multiline ? "block sm:col-span-2" : "block"}>
                  <span className="label">{f.label}</span>
                  {f.multiline ? (
                    <TextArea rows={f.key === "heroFeatures" ? 5 : 3} value={texts[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
                  ) : (
                    <TextInput value={texts[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
                  )}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="link mt-1.5 text-[12px]"
              onClick={() => {
                setTexts(DEFAULT_TEXTS);
                app.toast("ডিফল্ট টেক্সট বসানো হয়েছে — সেভ করলে প্রযোজ্য হবে", "info");
              }}
            >
              ডিফল্টে ফিরিয়ে নিন
            </button>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-extrabold">📢 নোটিশ বোর্ড (উপরে বাম→ডান স্ক্রল হবে)</div>
            <div className="flex gap-2">
              <input
                className="input"
                value={draft}
                placeholder="নতুন নোটিশ লিখুন…"
                maxLength={240}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNotice();
                  }
                }}
              />
              <button type="button" className="btn btn-soft shrink-0" onClick={addNotice} disabled={!draft.trim()}>
                ➕ যোগ
              </button>
            </div>

            {notices.length === 0 ? (
              <div className="muted mt-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-[12.5px]">
                কোনো নোটিশ নেই
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {notices.map((n, i) => (
                  <div key={n.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5">
                    <input
                      className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                      value={n.text}
                      maxLength={240}
                      onChange={(e) => setNotices((p) => p.map((x, xi) => (xi === i ? { ...x, text: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      className={`pill ${n.active ? "pill-ok" : "pill-muted"} shrink-0`}
                      title={n.active ? "সক্রিয় — বন্ধ করতে চাপুন" : "বন্ধ — চালু করতে চাপুন"}
                      onClick={() => setNotices((p) => p.map((x, xi) => (xi === i ? { ...x, active: !x.active } : x)))}
                    >
                      {n.active ? "সক্রিয়" : "বন্ধ"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm shrink-0 text-[var(--danger)]"
                      onClick={() => setNotices((p) => p.filter((_, xi) => xi !== i))}
                    >
                      মুছুন
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
