"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Modal, Select, TextArea, TextInput } from "@/components/ui";
import { mess } from "@/lib/client";
import { useApp } from "@/components/app-context";
import { DEFAULT_TEXTS, HERO_THEMES, type Notice, type UiTexts } from "@/lib/ui-content-types";

/* ══════════════════════════════════════════════════════════
 *  এডিটেবল টেক্সট + স্ক্রলিং নোটিশ বোর্ড (ক্লায়েন্ট অংশ)
 *  • useUiContent  — অফিস অনুযায়ী টেক্সট/নোটিশ লোড ও ক্যাশ
 *  • NoticeTicker  — বাম→ডান স্ক্রলিং নোটিশ (শুধু প্রেজেন্টেশন)
 *  • GlobalEditButton — যেকোনো পেজ থেকে একটাই ভাসমান ✏️ এডিট বাটন (শুধুমাত্র অ্যাডমিন)
 *  • UiContentEditor — অ্যাডমিন এডিটর (গ্লোবাল/অফিস দুই স্কোপই)
 * ══════════════════════════════════════════════════════════ */

type Content = { texts: UiTexts; notices: Notice[] };
type Scope = "global" | "office";

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
export function NoticeTicker({ notices, label }: { notices: Notice[]; label?: string }) {
  const list = notices.filter((n) => n.active !== false && n.text.trim());
  if (!list.length) return null;
  return (
    <div className="notice-ticker no-print">
      <span className="notice-ticker__label">{label?.trim() || "📢 নোটিশ"}</span>
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
  const { texts, notices } = useUiContent(app.office?.id ?? null);
  return <NoticeTicker notices={notices} label={texts.marqueeLabel} />;
}

/** ═══════════ একটাই ভাসমান এডিট বাটন — শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিন ═══════════ */
export function GlobalEditButton() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  if (app.user?.role !== "admin") return null;
  // অফিস নির্বাচিত থাকলে ডিফল্ট scope অফিস; অফিসহীন অ্যাডমিন হলে গ্লোবাল
  const initial: Scope = app.user?.role === "admin" && !app.office ? "global" : "office";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="অ্যাপের টেক্সট, হেডার, ফুটার, হিরো ও নোটিশ এডিট করুন"
        aria-label="কন্টেন্ট এডিট করুন"
        className="fixed bottom-[72px] right-3 z-40 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[13px] font-extrabold text-white shadow-lg shadow-black/20 transition hover:brightness-110 sm:bottom-5"
        style={{ background: "linear-gradient(135deg,#0d9488 0%,var(--brand) 55%,#059669 100%)" }}
      >
        <span aria-hidden>✏️</span>
        <span>এডিট</span>
      </button>
      <UiContentEditor open={open} onClose={() => setOpen(false)} scope={initial} />
    </>
  );
}

/* ── এডিটর ফিল্ড বিন্যাস (সেকশনভিত্তিক) ───────────────────── */
const FIELD_GROUPS: { title: string; fields: { key: keyof UiTexts; label: string; multiline?: boolean; theme?: boolean }[] }[] = [
  {
    title: "🏷️ ব্র্যান্ড ও হেডার",
    fields: [
      { key: "appName", label: "অ্যাপের নাম / App Name (লগইন পেজ, ফুটার)" },
      { key: "headerTitle", label: "উপরের হেডারের টাইটেল (খালি রাখলে অ্যাপের নাম)" },
      { key: "headerTagline", label: "হেডারের ট্যাগলাইন (খালি রাখলে অফিস • শাখা)", multiline: true },
      { key: "marqueeLabel", label: "স্ক্রলিং বারের লেবেল (যেমন 📢 নোটিশ)" },
    ],
  },
  {
    title: "🦸 লগইন পেজের Hero",
    fields: [
      { key: "heroBadge", label: "Hero Badge (ব্র্যান্ডের নিচের লাইন)" },
      { key: "heroTheme", label: "Hero স্টাইল / থিম (রঙ)", theme: true },
      { key: "heroTitle", label: "Hero Title", multiline: true },
      { key: "heroDescription", label: "Hero Description", multiline: true },
      { key: "heroFeatures", label: "Hero Features (প্রতি লাইনে একটি)", multiline: true },
    ],
  },
  {
    title: "📊 ড্যাশবোর্ড",
    fields: [
      { key: "dashboardTitle", label: "ড্যাশবোর্ড হেডার / Title" },
      { key: "dashboardSubtitle", label: "ড্যাশবোর্ড সাবটাইটেল (নিজের লেখা)", multiline: true },
    ],
  },
  {
    title: "📄 ফুটার",
    fields: [
      { key: "footerText", label: "ফুটারের মূল লেখা" },
      { key: "footerSubText", label: "ফুটারের ছোট লাইন (ভার্সন/ট্যাগলাইন)" },
    ],
  },
];

export function UiContentEditor({
  open,
  onClose,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  scope: Scope;
}) {
  const app = useApp();
  const isAdmin = app.user?.role === "admin";
  const [effScope, setEffScope] = useState<Scope>(scope);
  const [texts, setTexts] = useState<UiTexts>(DEFAULT_TEXTS);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setEffScope(scope);
  }, [open, scope]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    mess<{ texts: UiTexts; notices: Notice[] }>("ui.editor", { scope: effScope })
      .then((res) => {
        setTexts(res?.texts ?? DEFAULT_TEXTS);
        setNotices(res?.notices ?? []);
      })
      .catch(() => app.toast("এডিটযোগ্য কন্টেন্ট লোড করা যায়নি", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effScope]);

  const setField = useCallback((key: keyof UiTexts, value: string) => setTexts((p) => ({ ...p, [key]: value })), []);

  const officeMissing = effScope === "office" && !app.office;

  const addNotice = () => {
    const text = draft.trim();
    if (!text) return;
    setNotices((p) => [...p, { id: `new-${Date.now()}`, text: text.slice(0, 240), active: true, createdAt: new Date().toISOString() }].slice(0, 20));
    setDraft("");
  };

  const save = async () => {
    if (officeMissing) {
      app.toast("অফিস-নির্দিষ্ট এডিটের জন্য উপরে আগে একটি অফিস নির্বাচন করুন", "error");
      return;
    }
    setBusy(true);
    try {
      await mess("ui.updateTexts", { scope: effScope, texts });
      await mess("ui.updateNotices", { scope: effScope, notices });
      await refreshUiContent(effScope === "office" ? app.office?.id : null);
      app.toast(effScope === "global" ? "গ্লোবাল টেক্সট ও নোটিশ হালনাগাদ হয়েছে ✓" : "অফিসের টেক্সট ও নোটিশ হালনাগাদ হয়েছে ✓", "success");
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
      title="🎛 অ্যাপ কন্টেন্ট এডিটর"
      subtitle="হেডার, ফুটার, Hero টাইটেল/স্টাইল, ড্যাশবোর্ড ও উপরের স্ক্রলিং নোটিশ"
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:items-center">
          <button
            type="button"
            className="link text-[12px]"
            onClick={() => {
              setTexts(DEFAULT_TEXTS);
              app.toast("ডিফল্ট টেক্সট বসানো হয়েছে — সেভ করলে প্রযোজ্য হবে", "info");
            }}
          >
            ডিফল্টে ফিরিয়ে নিন
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || loading || officeMissing}>
              {busy ? "সংরক্ষণ হচ্ছে…" : "💾 সেভ করুন"}
            </button>
          </div>
        </div>
      }
    >
      {/* scope টগল — শুধু অ্যাডমিনের জন্য */}
      {isAdmin ? (
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] p-1 text-[12.5px] font-bold">
          {(["office", "global"] as Scope[]).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => setEffScope(sc)}
              className={`rounded-md px-2 py-1.5 transition ${effScope === sc ? "bg-[var(--brand)] text-white" : "muted hover:bg-[var(--brand-soft)]"}`}
            >
              {sc === "office" ? "🏢 এই অফিস" : "🌐 সব অফিস (গ্লোবাল)"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="muted mb-3 -mt-1 text-[11.5px]">
        {effScope === "global"
          ? "গ্লোবাল টেক্সট সব অফিস ও লগইন পেজে দেখাবে। কোনো অফিসে আলাদা টেক্সট থাকলে সেটা গ্লোবালকে ওভাররাইড করবে।"
          : "শুধু নির্বাচিত অফিসের জন্য প্রযোজ্য হবে (গ্লোবাল টেক্সটের উপরে বসবে)।"}
      </div>

      {officeMissing ? (
        <div className="mb-3 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-[12.5px] font-semibold">
          ⚠ অফিস-নির্দিষ্ট এডিটের জন্য উপরের অফিস সিলেক্টর থেকে আগে একটি অফিস নির্বাচন করুন।
        </div>
      ) : null}

      {loading ? (
        <div className="muted py-6 text-center text-[13px]">লোড হচ্ছে…</div>
      ) : (
        <div className="space-y-4">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[13px] font-extrabold">{group.title}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <label key={f.key} className={f.multiline || f.theme ? "block sm:col-span-2" : "block"}>
                    <span className="label">{f.label}</span>
                    {f.theme ? (
                      <Select value={texts.heroTheme} onChange={(e) => setField("heroTheme", e.target.value)}>
                        {HERO_THEMES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    ) : f.multiline ? (
                      <TextArea rows={f.key === "heroFeatures" ? 5 : 3} value={texts[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
                    ) : (
                      <TextInput value={texts[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div>
            <div className="mb-2 text-[13px] font-extrabold">📢 স্ক্রলিং নোটিশ বার (উপরে বাম→ডান স্ক্রল হবে)</div>
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
