"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { GuideLine } from "@/components/GuideLine";
import { Badge, Card, EmptyState, Loader } from "@/components/ui";
import { formatMeal, formatMoney, formatRate, round2, toNumber } from "@/lib/format";
import { isoOfDay, isValidIso, toDisplayDate, toIsoDate, weekdayBn, weekdayBnShort, todayIso } from "@/lib/date";

/* ══════════════════════════════════════════════════════════
 *  মাস গ্রিডের একটি ঘর — নিজস্ব local text state
 *  • "1." টাইপ করলে "1" হয়ে যায় না → "1.5" লেখা যায়
 *  • React.memo → টাইপ করলে শুধু এই একটা ঘর রি-রেন্ডার হয় (ল্যাগ নেই)
 * ══════════════════════════════════════════════════════════ */
type GridCellProps = {
  day: number;
  memberId: string;
  value: number;
  disabled: boolean;
  audit?: boolean;
  label: string;
  onCommitCell: (d: number, memberId: string, v: number) => void;
  onCommitAudit: (d: number, v: number) => void;
};

const GridCellInput = React.memo(function GridCellInput({
  day,
  memberId,
  value,
  disabled,
  audit,
  label,
  onCommitCell,
  onCommitAudit,
}: GridCellProps) {
  const [text, setText] = useState(value > 0 ? String(value) : "");
  const editing = React.useRef(false);

  /* ফোকাস না থাকলে বাইরের value দিয়ে নিজেকে মেলায় */
  useEffect(() => {
    if (!editing.current) setText(value > 0 ? String(value) : "");
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`meal-cell-compact ${value > 0 ? "" : "zero"}${audit ? " meal-cell-audit" : ""}`}
      style={{ width: 37, minWidth: 37 }}
      value={text}
      placeholder=""
      disabled={disabled}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, "");
        setText(t);
        const n = t === "" || t === "." ? 0 : Number(t);
        const v = Number.isFinite(n) ? Math.max(0, n) : 0;
        if (audit) onCommitAudit(day, v);
        else onCommitCell(day, memberId, v);
      }}
      onBlur={() => {
        editing.current = false;
        setText(value > 0 ? String(value) : "");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      aria-label={label}
    />
  );
});

export function MealsView() {
  const app = useApp();
  const data = app.data;
  const summary = app.summary;
  const month = app.month;

  const [date, setDate] = useState<string>(todayIso());
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [gridDraft, setGridDraft] = useState<Record<string, Record<string, number>>>({});
  const [gridSaving, setGridSaving] = useState(false);
  // কাস্টম কিবোর্ড: নির্বাচিত সদস্য-ঘর ও টাইপ-বাফার
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [buffer, setBuffer] = useState<string>("");
  /* পিসি/ডেস্কটপ ডিটেকশন — ডেস্কটপে ঘর সরাসরি টাইপ করা যাবে;
   * মোবাইলে আগের মতোই <button> + কাস্টম কিবোর্ড (নেটিভ কিবোর্ড উঠবে না) */
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const upd = () => setIsDesktop(mq.matches);
    upd();
    mq.addEventListener?.("change", upd);
    return () => mq.removeEventListener?.("change", upd);
  }, []);
  /* ডেস্কটপে টাইপ করার সময় raw text (যেন "1." লিখতে "1" হয়ে না যায়) */
  const [rawText, setRawText] = useState<Record<string, string>>({});
  // AM / Audit মিল (হিসাবের বাইরে) — দিন-ভিত্তিক খসড়া; সেভ করলে খালি হয়
  const [auditDraft, setAuditDraft] = useState<Record<number, number>>({});
  const [auditSaving, setAuditSaving] = useState(false);

  const canWrite = app.can("meals.write") && !(month?.isClosed && app.role !== "admin");

  /* keep the picked date inside the selected month */
  useEffect(() => {
    if (!month) return;
    const iso = toIsoDate(date);
    const [y, m] = iso.split("-").map(Number);
    if (y !== month.year || m !== month.month) {
      const today = todayIso();
      const [ty, tm, td] = today.split("-").map(Number);
      if (ty === month.year && tm === month.month) setDate(today);
      else setDate(isoOfDay(month.year, month.month, 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month?.id]);

  const iso = toIsoDate(date);
  const day = Number(iso.split("-")[2]);

  const dayRows = useMemo(() => {
    if (!data) return [];
    const byMember = new Map(data.dailyMeals.filter((r) => r.day === day).map((r) => [r.memberId, r.meals]));
    return data.members.map((m) => ({
      member: m,
      meals: round2(toNumber(byMember.get(m.id) ?? 0)),
    }));
  }, [data, day]);

  /* ── draft sync ───────────────────────────────────────────────
   * আগে data রিফ্রেশ হলেই draft সম্পূর্ণ রিসেট হতো → টাইপ করা মিল
   * (বিশেষ করে প্রথম সদস্যের) হারিয়ে যেত। এখন:
   *   • দিন/মাস বদলালেই শুধু সার্ভারের মান দিয়ে রিসেট
   *   • অন্য সময় ইউজারের টাইপ করা অসংরক্ষিত মান অক্ষুণ্ণ থাকে */
  const dayKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${month?.id ?? ""}#${day}`;
    const dayChanged = dayKeyRef.current !== key;
    dayKeyRef.current = key;
    setDraft((prev) => {
      const next: Record<string, number> = {};
      for (const r of dayRows) {
        next[r.member.id] = dayChanged ? r.meals : prev[r.member.id] ?? r.meals;
      }
      return next;
    });
    if (dayChanged) {
      setSelIdx(null);
      setBuffer("");
      setRawText({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, month?.id, dayRows]);

  /* ── AM / Audit মিল (হিসাবের বাইরে) ─────────────────
   * data.auditMeals কখনো calculateMonth()-এ যায় না — এখানে শুধু দেখা/এন্ট্রি। */
  const auditByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of data?.auditMeals ?? []) map.set(r.day, round2(toNumber(r.count)));
    return map;
  }, [data]);

  const auditVal = (d: number) => (auditDraft[d] !== undefined ? round2(toNumber(auditDraft[d])) : (auditByDay.get(d) ?? 0));
  const setAuditVal = (d: number, v: number) => {
    setAuditDraft((prev) => ({ ...prev, [d]: Math.max(0, v) }));
  };

  const dayTotal = round2(Object.values(draft).reduce((s, v) => s + toNumber(v), 0));
  const memberTotals = useMemo(() => {
    const map = new Map<string, number>();
    if (summary) for (const c of summary.memberCalculations) map.set(c.memberId, c.totalMill);
    return map;
  }, [summary]);

  if (!data || !month) return <Loader label="Loading meals…" />;

  /** মাসের মোট AM / Audit মিল — কেবল প্রদর্শনের জন্য (কোনো হিসাবে নেই) */
  const auditMonthTotal = round2(
    Array.from({ length: month.totalDays }).reduce<number>((sum, _, i) => sum + toNumber(auditVal(i + 1)), 0),
  );

  const shiftDate = (delta: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const nextIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (nextIso.slice(0, 7) !== iso.slice(0, 7)) {
      app.toast("এই মাসের বাইরে যাওয়া যাবে না — মাস পরিবর্তন করুন", "info");
      return;
    }
    setDate(nextIso);
  };

  const bulkSet = (value: number) => {
    if (!canWrite) return;
    const next: Record<string, number> = {};
    for (const r of dayRows) next[r.member.id] = r.member.isActive ? value : 0;
    setDraft(next);
  };

  const saveDay = async () => {
    if (!canWrite) return;
    setSaving(true);
    const entries = Object.entries(draft).map(([memberId, meals]) => ({ memberId, meals: round2(toNumber(meals)) }));
    const res = await app.call<{ saved: number; total: number }>("meals.saveDay", { date: iso, entries });
    setSaving(false);
    if (res) app.toast(`${toDisplayDate(iso)} তারিখের মিল সংরক্ষিত হয়েছে ✓ (মোট ${formatMeal(res.total)} মিল)`, "success");
  };

  /* AM / Audit মিল — শুধু এই দিনটি সংরক্ষণ (মোট মিল/খরচে কোনো প্রভাব নেই) */
  const saveAuditDay = async () => {
    if (!canWrite) return;
    setAuditSaving(true);
    const res = await app.call<{ saved: number; total: number }>("auditMeals.save", {
      entries: [{ day, count: round2(toNumber(auditVal(day))) }],
    });
    setAuditSaving(false);
    if (res) {
      setAuditDraft((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
      app.toast(`${toDisplayDate(iso)} — AM/Audit মিল সংরক্ষিত ✓ (মাসের মোট ${formatMeal(res.total)})`, "success");
    }
  };

  /* ── month grid ───────────────────────────────────── */
  const grid = useMemo(() => {
    const g: Record<number, Record<string, number>> = {};
    for (let d = 1; d <= month.totalDays; d++) {
      g[d] = {};
      for (const m of data.members) g[d][m.id] = 0;
    }
    for (const r of data.dailyMeals) {
      if (!g[r.day]) g[r.day] = {};
      g[r.day][r.memberId] = round2(toNumber(r.meals));
    }
    // merge unsaved grid edits
    for (const [dStr, row] of Object.entries(gridDraft)) {
      const d = Number(dStr);
      if (!g[d]) g[d] = {};
      for (const [memberId, v] of Object.entries(row)) g[d][memberId] = round2(toNumber(v));
    }
    return g;
  }, [data, month.totalDays, gridDraft]);

  const setGridCell = (d: number, memberId: string, value: number) => {
    setGridDraft((prev) => ({ ...prev, [d]: { ...(prev[d] ?? {}), [memberId]: value } }));
  };
  /* React.memo-এর জন্য স্থায়ী (stable) কলব্যাক — রি-রেন্ডার আটকে দেয় না */
  const commitCell = useCallback((d: number, memberId: string, value: number) => {
    setGridDraft((prev) => ({ ...prev, [d]: { ...(prev[d] ?? {}), [memberId]: value } }));
  }, []);
  const commitAudit = useCallback((d: number, value: number) => {
    setAuditDraft((prev) => ({ ...prev, [d]: Math.max(0, value) }));
  }, []);

  const saveGrid = async () => {
    if (!canWrite) return;
    setGridSaving(true);
    let savedDays = 0;
    let auditSaved = 0;
    for (const [dStr, row] of Object.entries(gridDraft)) {
      const entries = Object.entries(row).map(([memberId, meals]) => ({ memberId, meals: round2(toNumber(meals)) }));
      if (!entries.length) continue;
      const res = await app.call<{ saved: number }>("meals.saveDay", {
        date: isoOfDay(month.year, month.month, Number(dStr)),
        entries,
      });
      if (res) savedDays += 1;
    }
    // AM / Audit মিলের খসড়া (হিসাবের বাইরে) — একই বাটনে সেভ
    const auditEntries = Object.entries(auditDraft).map(([d, count]) => ({ day: Number(d), count: round2(toNumber(count)) }));
    if (auditEntries.length) {
      const res = await app.call<{ saved: number }>("auditMeals.save", { entries: auditEntries });
      if (res) auditSaved = auditEntries.length;
    }
    setGridDraft({});
    setAuditDraft({});
    setGridSaving(false);
    app.toast(
      `${savedDays} দিনের মিল সংরক্ষিত হয়েছে ✓${auditSaved ? ` • AM/Audit ${auditSaved} দিন ✓` : ""}`,
      "success",
    );
  };

  const gridChanged =
    Object.values(gridDraft).some((row) => Object.keys(row).length > 0) || Object.keys(auditDraft).length > 0;

  /* ── কাস্টম কিবোর্ড (দিন-এন্ট্রি) ─────────────────────
   * ঘরে ট্যাপ → নেটিভ কিবোর্ড খোলে না; নিচের প্যাড থেকে সংখ্যা,
   * ◀ ▶ দিয়ে সদস্য বদল, Save/Reset বাটন। */
  const editableIdx = dayRows.map((r, i) => (r.member.isActive ? i : -1)).filter((i) => i >= 0);
  const selectCell = (i: number) => {
    if (!canWrite || !dayRows[i]?.member.isActive) return;
    setSelIdx(i);
    setBuffer("");
  };
  const applyBuffer = (buf: string) => {
    if (selIdx == null) return;
    const id = dayRows[selIdx]?.member.id;
    if (!id) return;
    const num = buf === "" || buf === "." ? 0 : Number(buf);
    setDraft((p) => ({ ...p, [id]: Number.isFinite(num) ? num : 0 }));
  };
  const pressDigit = (ch: string) => {
    if (selIdx == null) return;
    let next = buffer + ch;
    if (ch === "." && buffer.includes(".")) return;
    if (next === ".") next = "0.";
    if (next.length > 5) return;
    setBuffer(next);
    applyBuffer(next);
  };
  const pressBackspace = () => {
    if (selIdx == null) return;
    const next = buffer.slice(0, -1);
    setBuffer(next);
    applyBuffer(next);
  };
  const moveSel = (delta: number) => {
    if (!editableIdx.length) return;
    const pos = selIdx == null ? -1 : editableIdx.indexOf(selIdx);
    let nextPos = pos + delta;
    if (pos === -1) nextPos = delta > 0 ? 0 : editableIdx.length - 1;
    if (nextPos < 0) nextPos = editableIdx.length - 1;
    if (nextPos >= editableIdx.length) nextPos = 0;
    setSelIdx(editableIdx[nextPos]);
    setBuffer("");
    setRawText({});
  };
  const resetDay = () => {
    const next: Record<string, number> = {};
    for (const r of dayRows) next[r.member.id] = r.meals;
    setDraft(next);
    setBuffer("");
    setRawText({});
    app.toast("এই দিনের অসংরক্ষিত পরিবর্তন বাতিল হয়েছে", "info");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[17px] font-extrabold leading-tight">দৈনিক মিল</h1>
        <Badge tone={dayTotal > 0 ? "brand" : "muted"}>দিনের মোট: {formatMeal(dayTotal)}</Badge>
      </div>

      {!canWrite ? (
        <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--warn)]">
          {month.isClosed
            ? "🔒 এই মাসটি বন্ধ করা হয়েছে — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন।"
            : "👁 আপনি শুধু দেখতে পারবেন। মিল এন্ট্রি/পরিবর্তন করার অনুমতি শুধু ম্যানেজার ও অ্যাডমিনের।"}
        </div>
      ) : null}

      {data.members.length === 0 ? (
        <EmptyState
          icon="👥"
          title="কোনো সদস্য পাওয়া যায়নি"
          hint="আগে সদস্য যোগ করুন, তারপর দৈনিক মিল এন্ট্রি দিন।"
          action={
            app.can("members.write") ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => app.setTab("members")}>
                + সদস্য যোগ করুন
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* ── কমপ্যাক্ট দিন-এন্ট্রি: হেডারে নাম, নিচে ম্যানুয়াল ঘর ── */}
          <Card
            title="তারিখ অনুযায়ী মিল এন্ট্রি"
            subtitle={`${toDisplayDate(iso)} (${weekdayBn(iso)}) • দিন ${day}`}
            action={
              canWrite ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveDay()}>
                  {saving ? "সংরক্ষণ হচ্ছে…" : "💾 Save"}
                </button>
              ) : null
            }
          >
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm h-9 w-9 px-0" onClick={() => shiftDate(-1)} aria-label="আগের দিন">
                ‹
              </button>
              <input
                type="date"
                className="input input-sm h-9 w-auto min-w-[140px]"
                value={isValidIso(iso) ? iso : ""}
                min={isoOfDay(month.year, month.month, 1)}
                max={isoOfDay(month.year, month.month, month.totalDays)}
                onChange={(e) => setDate(e.target.value)}
              />
              <button type="button" className="btn btn-ghost btn-sm h-9 w-9 px-0" onClick={() => shiftDate(1)} aria-label="পরের দিন">
                ›
              </button>
              <button type="button" className="btn btn-ghost btn-sm h-9" onClick={() => setDate(todayIso())}>
                আজ
              </button>
              {/* সবাইকে quick buttons removed as per user request */}
            </div>

            <div className="table-wrap" style={{ overflow: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="data" style={{ minWidth: "max-content", width: "100%" }}>
                <thead>
                  <tr>
                    {dayRows.map(({ member }) => (
                      <th key={member.id} className="bg-[var(--brand-soft)] px-1 py-1.5 text-center" style={{ minWidth: 82 }}>
                        <span className={`block max-w-[104px] truncate text-[13px] font-bold ${member.isActive ? "" : "opacity-60"}`} title={member.name}>
                          {member.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {dayRows.map(({ member, meals }, i) => {
                      const raw = draft[member.id] ?? meals;
                      const v = toNumber(raw);
                      const selected = selIdx === i;
                      const isEmpty = !(v > 0);
                      const typing = rawText[member.id];
                      const shown = typing !== undefined ? typing : isEmpty ? "" : formatMeal(v);
                      return (
                        <td key={member.id} className="p-1 text-center">
                          {isDesktop ? (
                            /* ── পিসি/ডেস্কটপ: সরাসরি টাইপ করা যায় ── */
                            <input
                              type="text"
                              inputMode="decimal"
                              className={`meal-cell ${isEmpty ? "zero" : ""} ${selected ? "meal-cell-selected" : ""}`}
                              style={{ width: 78, minWidth: 78, height: 46 }}
                              value={shown}
                              placeholder=""
                              disabled={!canWrite || !member.isActive}
                              onFocus={(e) => {
                                setSelIdx(i);
                                e.currentTarget.select();
                              }}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, "");
                                setRawText((p) => ({ ...p, [member.id]: val }));
                                const num = val === "" || val === "." ? 0 : Number(val);
                                setDraft((p) => ({ ...p, [member.id]: Number.isFinite(num) ? Math.max(0, num) : 0 }));
                              }}
                              onBlur={() => {
                                setRawText((p) => {
                                  const n = { ...p };
                                  delete n[member.id];
                                  return n;
                                });
                              }}
                              onKeyDown={(e) => {
                                /* Enter → সেভ, Tab/Arrow → পরের সদস্য */
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveDay();
                                }
                              }}
                              aria-label={`${member.name} মিল`}
                            />
                          ) : (
                            /* ── মোবাইল: ট্যাপ করলে কাস্টম কিবোর্ড ── */
                            <button
                              type="button"
                              className={`meal-cell ${isEmpty ? "zero" : ""} ${selected ? "meal-cell-selected" : ""}`}
                              style={{ width: 78, minWidth: 78, height: 46 }}
                              disabled={!canWrite || !member.isActive}
                              onClick={() => selectCell(i)}
                              aria-label={`${member.name} মিল`}
                            >
                              {isEmpty ? "" : formatMeal(v)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    {dayRows.map(({ member }) => (
                      <td key={member.id} className="muted text-center text-[10.5px] tabular-nums">
                        মোট {formatMeal(memberTotals.get(member.id) ?? 0)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── AM / Audit মিল — ছোট, সুন্দর, নজরে আসে ── */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 px-3 py-1.5 shadow-[0_2px_8px_rgba(251,191,36,0.15)] backdrop-blur-sm">
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                📋 AM/Audit
              </span>
              <span className="text-[10.5px] font-semibold text-amber-900">হিসাবের বাইরে</span>
              <input
                type="text"
                inputMode="decimal"
                className="h-7 w-14 rounded-full border border-amber-200 bg-white text-center text-[12px] font-bold tabular-nums shadow-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                value={auditVal(day) > 0 ? String(auditVal(day)) : ""}
                disabled={!canWrite}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (val === "") setAuditVal(day, 0);
                  else setAuditVal(day, Number(val) || 0);
                }}
                aria-label={`${toDisplayDate(iso)} AM/Audit মিল`}
                placeholder=""
              />
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-full bg-amber-500 text-[12px] text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50"
                disabled={!canWrite || auditSaving}
                onClick={() => void saveAuditDay()}
                title="Save AM/Audit"
              >
                {auditSaving ? "…" : "💾"}
              </button>
              <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-amber-800">
                <span className="hidden sm:inline">শুধু রেকর্ড — হিসাবে যোগ হবে না •</span>
                মাসের মোট: <strong className="tabular-nums">{formatMeal(auditMonthTotal)}</strong>
              </span>
            </div>

            {/* ── কাস্টম কিবোর্ড — মোবাইল কিবোর্ডের মতো নিচ থেকে ভেসে ওঠে, ঘর বাছলে তবেই ── */}
            {canWrite && selIdx != null ? (
              <div className="meal-pad-sheet md:hidden" role="dialog" aria-label="মিল কিবোর্ড">
                <div className="meal-pad">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate font-bold">
                      {dayRows[selIdx] ? (
                        <>
                          ✏️ {dayRows[selIdx].member.name}
                          <span className="muted font-semibold"> — মিল: </span>
                          <span className="tabular-nums text-[var(--brand)]">
                            {formatMeal(toNumber(draft[dayRows[selIdx].member.id] ?? dayRows[selIdx].meals))}
                          </span>
                        </>
                      ) : null}
                    </span>
                    <span className="muted shrink-0 tabular-nums">মোট {formatMeal(dayTotal)}</span>
                    <button
                      type="button"
                      className="pad-key pad-key-nav h-8 w-8 shrink-0 !py-0 text-[13px]"
                      onClick={() => {
                        setSelIdx(null);
                        setBuffer("");
                      }}
                      aria-label="কিবোর্ড বন্ধ"
                    >
                      ✕
                    </button>
                  </div>
                  {/* ২য় ছবির কিবোর্ড — 7 8 9 / 4 5 6 / 1 2 3 / 0, লাল Close, ধূসর Reset, সবুজ Save */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {/* Row 1 */}
                    <button type="button" className="pad-key" onClick={() => pressDigit("7")}>
                      7
                    </button>
                    <button type="button" className="pad-key" onClick={() => pressDigit("8")}>
                      8
                    </button>
                    <button type="button" className="pad-key" onClick={() => pressDigit("9")}>
                      9
                    </button>
                    <button type="button" className="pad-key-close" onClick={() => { setSelIdx(null); setBuffer(""); }} aria-label="কিবোর্ড বন্ধ">
                      ✕ Close
                    </button>

                    {/* Row 2 */}
                    <button type="button" className="pad-key" onClick={() => pressDigit("4")}>
                      4
                    </button>
                    <button type="button" className="pad-key" onClick={() => pressDigit("5")}>
                      5
                    </button>
                    <button type="button" className="pad-key" onClick={() => pressDigit("6")}>
                      6
                    </button>
                    <button type="button" className="pad-key-reset" onClick={resetDay} aria-label="রিসেট">
                      ↺ Reset
                    </button>

                    {/* Row 3 */}
                    <button type="button" className="pad-key" onClick={() => pressDigit("1")}>
                      1
                    </button>
                    <button type="button" className="pad-key" onClick={() => pressDigit("2")}>
                      2
                    </button>
                    <button type="button" className="pad-key" onClick={() => pressDigit("3")}>
                      3
                    </button>
                    <button type="button" className="pad-key" onClick={pressBackspace} aria-label="মুছুন">
                      ⌫
                    </button>

                    {/* Row 4 — 0 চওড়া + . + সদস্য navigator */}
                    <button type="button" className="pad-key col-span-2" onClick={() => pressDigit("0")}>
                      0
                    </button>
                    <button type="button" className="pad-key" onClick={() => pressDigit(".")}>
                      .
                    </button>
                    <div className="grid grid-rows-2 gap-1">
                      <button type="button" className="pad-key pad-key-nav !py-1 text-[15px]" onClick={() => moveSel(-1)} aria-label="আগের সদস্য">
                        ◀
                      </button>
                      <button type="button" className="pad-key pad-key-nav !py-1 text-[15px]" onClick={() => moveSel(1)} aria-label="পরের সদস্য">
                        ▶
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pad-key pad-key-save mt-1.5 w-full"
                    disabled={saving}
                    onClick={() => void saveDay()}
                  >
                    {saving ? "সংরক্ষণ হচ্ছে…" : "💾 Save — এই দিনের মিল সেভ করুন"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-2 text-[12.5px]">
              <span className="muted">দিনের মোট: </span>
              <strong className="tabular-nums">{formatMeal(dayTotal)}</strong>
              <span className="muted"> মিল • মাসের মোট: </span>
              <strong className="tabular-nums">{formatMeal(summary?.totalMill ?? 0)}</strong>
              <span className="muted"> মিল</span>
            </div>
            <GuideLine section="meals" text="ডুপ্লিকেট হয় না, ০ দিলে মুছে যায়" />
          </Card>

          {/* ── মাস গ্রিড — নিচে ── */}
          <Card
            title="মাস গ্রিড"
            subtitle="উপরের সারিতে তারিখ, বাম পাশের কলমে সদস্যের নাম • নিচের AM/Audit সারি শুধু রেকর্ড"
            action={
              canWrite ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={!gridChanged || gridSaving} onClick={() => void saveGrid()}>
                  {gridSaving ? "সংরক্ষণ হচ্ছে…" : gridChanged ? "💾 পরিবর্তন সেভ করুন" : "সব সেভ করা আছে"}
                </button>
              ) : null
            }
          >
            <div className="table-wrap" style={{ maxHeight: "78vh" }}>
            <table className="data grid-compact" style={{ minWidth: 104 + month.totalDays * 40 + 48 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 bg-[var(--brand-soft)]" style={{ minWidth: 96 }}>
                    সদস্য / Staff
                  </th>
                  {Array.from({ length: month.totalDays }).map((_, i) => {
                    const d = i + 1;
                    return (
                      <th key={d} className="num sticky top-0 z-10 bg-[var(--brand-soft)]" style={{ minWidth: 37 }}>
                        <span className="block text-[11px] font-extrabold tabular-nums leading-none">{d}</span>
                        <span className="block whitespace-nowrap text-center text-[8.5px] font-semibold leading-tight text-[var(--muted)]">
                          {weekdayBnShort(isoOfDay(month.year, month.month, d))}
                        </span>
                      </th>
                    );
                  })}
                  <th className="num sticky top-0 z-10 bg-[var(--brand-soft)]" style={{ minWidth: 46 }}>
                    মোট
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => {
                  const memberTotal = round2(
                    Array.from({ length: month.totalDays })
                      .map((_, i) => toNumber((grid[i + 1] ?? {})[m.id]))
                      .reduce((sum, v) => sum + v, 0),
                  );
                  return (
                    <tr key={m.id} className={m.isActive ? "" : "opacity-60"}>
                      <td className="sticky left-0 z-10 bg-[var(--card)]">
                        <span className="block max-w-[92px] truncate text-[12px] font-bold leading-tight">{m.name}</span>
                        {m.isActive ? null : <span className="muted block text-[10px]">নিষ্ক্রিয়</span>}
                      </td>
                      {Array.from({ length: month.totalDays }).map((_, i) => {
                        const d = i + 1;
                        const numVal = toNumber((grid[d] ?? {})[m.id]);
                        return (
                          <td key={d} className="num p-0.5">
                            <GridCellInput
                              day={d}
                              memberId={m.id}
                              value={numVal}
                              disabled={!canWrite || !m.isActive}
                              label={`${m.name} দিন ${d}`}
                              onCommitCell={commitCell}
                              onCommitAudit={commitAudit}
                            />
                          </td>
                        );
                      })}
                      <td className="num font-bold tabular-nums">{formatMeal(memberTotal)}</td>
                    </tr>
                  );
                })}
                  {/* AM / Audit মিল — শুধু রেকর্ডের জন্য; দৈনিক/মাসিক কোনো হিসাবেই নেই */}
                  <tr>
                    <td className="sticky left-0 z-10 bg-[var(--warn-soft)]">
                      <span className="block max-w-[92px] truncate text-[11px] font-bold leading-tight" style={{ color: "var(--warn)" }}>
                        AM / Audit
                      </span>
                      <span className="muted block text-[9px] leading-tight">হিসাবের বাইরে</span>
                    </td>
                    {Array.from({ length: month.totalDays }).map((_, i) => {
                      const d = i + 1;
                      const av = auditVal(d);
                      return (
                        <td key={d} className="num p-0.5">
                          <GridCellInput
                            day={d}
                            memberId="__audit__"
                            value={av}
                            audit
                            disabled={!canWrite}
                            label={`AM/Audit মিল দিন ${d}`}
                            onCommitCell={commitCell}
                            onCommitAudit={commitAudit}
                          />
                        </td>
                      );
                    })}
                    <td className="num font-bold tabular-nums" style={{ color: "var(--warn)" }}>
                      {formatMeal(auditMonthTotal)}
                    </td>
                  </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 font-bold">দৈনিক মোট</td>
                  {Array.from({ length: month.totalDays }).map((_, i) => {
                    const d = i + 1;
                    const row = grid[d] ?? {};
                    return (
                      <td key={d} className="num font-bold tabular-nums">
                        {formatMeal(round2(data.members.reduce((sum, m) => sum + toNumber(row[m.id]), 0)))}
                      </td>
                    );
                  })}
                  <td className="num font-extrabold tabular-nums">{formatMeal(summary?.totalMill ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          </Card>
        </>
      )}
    </div>
  );
}
