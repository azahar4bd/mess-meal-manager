"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { GuideLine } from "@/components/GuideLine";
import { Badge, Card, EmptyState, Loader } from "@/components/ui";
import { formatMeal, formatMoney, formatRate, round2, toNumber } from "@/lib/format";
import { isoOfDay, isValidIso, toDisplayDate, toIsoDate, weekdayBn, weekdayBnShort, todayIso } from "@/lib/date";

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

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const r of dayRows) next[r.member.id] = r.meals;
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, month?.id, data?.members.length]);

  const dayTotal = round2(Object.values(draft).reduce((s, v) => s + toNumber(v), 0));
  const memberTotals = useMemo(() => {
    const map = new Map<string, number>();
    if (summary) for (const c of summary.memberCalculations) map.set(c.memberId, c.totalMill);
    return map;
  }, [summary]);

  if (!data || !month) return <Loader label="Loading meals…" />;

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

  const saveGrid = async () => {
    if (!canWrite) return;
    setGridSaving(true);
    let savedDays = 0;
    for (const [dStr, row] of Object.entries(gridDraft)) {
      const entries = Object.entries(row).map(([memberId, meals]) => ({ memberId, meals: round2(toNumber(meals)) }));
      if (!entries.length) continue;
      const res = await app.call<{ saved: number }>("meals.saveDay", {
        date: isoOfDay(month.year, month.month, Number(dStr)),
        entries,
      });
      if (res) savedDays += 1;
    }
    setGridDraft({});
    setGridSaving(false);
    app.toast(`${savedDays} দিনের মিল সংরক্ষিত হয়েছে ✓`, "success");
  };

  const gridChanged = Object.values(gridDraft).some((row) => Object.keys(row).length > 0);

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
              {canWrite ? (
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <span className="muted text-[11.5px] font-semibold">সবাইকে:</span>
                  {[0, 1, 1.5, 2, 3].map((v) => (
                    <button key={v} type="button" className="btn btn-ghost btn-sm h-8 px-2 text-[12px]" onClick={() => bulkSet(v)}>
                      {v}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="table-wrap" style={{ overflow: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="data" style={{ minWidth: "max-content", width: "100%" }}>
                <thead>
                  <tr>
                    {dayRows.map(({ member }) => (
                      <th key={member.id} className="bg-[var(--brand-soft)] text-center" style={{ minWidth: 64 }}>
                        <span className={`block max-w-[86px] truncate text-[12px] ${member.isActive ? "" : "opacity-60"}`} title={member.name}>
                          {member.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {dayRows.map(({ member, meals }) => (
                      <td key={member.id} className="p-1 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          inputMode="decimal"
                          className={`meal-cell ${toNumber(draft[member.id] ?? meals) === 0 ? "zero" : ""}`}
                          style={{ width: 56, minWidth: 56 }}
                          value={toNumber(draft[member.id] ?? meals)}
                          disabled={!canWrite || !member.isActive}
                          onChange={(e) => setDraft((p) => ({ ...p, [member.id]: Number(e.target.value) }))}
                          aria-label={`${member.name} মিল`}
                        />
                      </td>
                    ))}
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
            subtitle="উপরের সারিতে তারিখ, বাম পাশের কলমে সদস্যের নাম"
            action={
              canWrite ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={!gridChanged || gridSaving} onClick={() => void saveGrid()}>
                  {gridSaving ? "সংরক্ষণ হচ্ছে…" : gridChanged ? "💾 পরিবর্তন সেভ করুন" : "সব সেভ করা আছে"}
                </button>
              ) : null
            }
          >
            <div className="table-wrap" style={{ maxHeight: "62vh" }}>
            <table className="data" style={{ minWidth: 130 + month.totalDays * 50 + 60 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 bg-[var(--brand-soft)]" style={{ minWidth: 118 }}>
                    সদস্য / Staff
                  </th>
                  {Array.from({ length: month.totalDays }).map((_, i) => {
                    const d = i + 1;
                    return (
                      <th key={d} className="num sticky top-0 z-10 bg-[var(--brand-soft)]" style={{ minWidth: 44 }}>
                        <span className="block text-[12.5px] font-extrabold tabular-nums">{d}</span>
                        <span className="block whitespace-nowrap text-center text-[9.5px] font-semibold text-[var(--muted)]">
                          {weekdayBnShort(isoOfDay(month.year, month.month, d))}
                        </span>
                      </th>
                    );
                  })}
                  <th className="num sticky top-0 z-10 bg-[var(--brand-soft)]" style={{ minWidth: 56 }}>
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
                        <span className="block max-w-[116px] truncate text-[13px] font-bold">{m.name}</span>
                        {m.isActive ? null : <span className="muted block text-[10px]">নিষ্ক্রিয়</span>}
                      </td>
                      {Array.from({ length: month.totalDays }).map((_, i) => {
                        const d = i + 1;
                        return (
                          <td key={d} className="num p-1">
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              className={`meal-cell ${toNumber((grid[d] ?? {})[m.id]) === 0 ? "zero" : ""}`}
                              style={{ width: 46, minWidth: 46 }}
                              value={toNumber((grid[d] ?? {})[m.id])}
                              disabled={!canWrite || !m.isActive}
                              onChange={(e) => setGridCell(d, m.id, Number(e.target.value))}
                              aria-label={`${m.name} দিন ${d}`}
                            />
                          </td>
                        );
                      })}
                      <td className="num font-bold tabular-nums">{formatMeal(memberTotal)}</td>
                    </tr>
                  );
                })}
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
