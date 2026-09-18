"use client";

import React, { useMemo } from "react";
import { useApp } from "@/components/app-context";
import { useUiContent } from "@/components/UiContent";
import { Badge, Card, EmptyState, Kpi, Loader } from "@/components/ui";
import { formatMeal, formatMoney, formatRate, round2 } from "@/lib/format";
import { toDisplayDate, toDisplayDateTime, monthLabelBn } from "@/lib/date";

export function DashboardView() {
  const app = useApp();
  const s = app.summary;
  const data = app.data;
  const { texts } = useUiContent(app.office?.id ?? null);

  // মাসগ্রিড (রিড-ওনলি): শুধু যে তারিখে মিল আছে সেই দিনগুলো, সদস্যভিত্তিক
  const mealGrid = useMemo(() => {
    if (!data) return { days: [] as number[], byDay: {} as Record<number, Record<string, number>>, memberTotals: {} as Record<string, number>, grand: 0 };
    const byDay: Record<number, Record<string, number>> = {};
    const memberTotals: Record<string, number> = {};
    let grand = 0;
    for (const r of data.dailyMeals) {
      const v = round2(Number(r.meals) || 0);
      if (v === 0) continue;
      (byDay[r.day] ??= {})[r.memberId] = v;
      memberTotals[r.memberId] = round2((memberTotals[r.memberId] ?? 0) + v);
      grand = round2(grand + v);
    }
    const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
    return { days, byDay, memberTotals, grand };
  }, [data]);

  // বাজার টেবিল (রিড-ওনলি): তারিখ অনুযায়ী সাজানো
  const bazarRows = useMemo(
    () => (data ? [...data.bazarExpenses].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) : []),
    [data],
  );

  if (!s || !data || !app.month) return <Loader label="Loading dashboard…" />;

  const due = round2(s.memberCalculations.filter((m) => m.statusEn === "Due").reduce((a, m) => a + Math.abs(m.denaPoana), 0));
  const receive = round2(s.memberCalculations.filter((m) => m.statusEn === "Receive").reduce((a, m) => a + m.denaPoana, 0));
  const daysWithMeals = new Set(data.dailyMeals.map((m) => m.day)).size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-[17px] font-extrabold leading-tight">{texts.dashboardTitle || "ড্যাশবোর্ড"}</h1>
          </div>
          {texts.dashboardSubtitle ? <p className="mt-0.5 text-[12px] font-semibold text-[var(--brand)]">{texts.dashboardSubtitle}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {app.can("meals.write") ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => app.setTab("meals")}>
              🍚 মিল এন্ট্রি
            </button>
          ) : null}
          {app.can("bazar.write") ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => app.setTab("bazar")}>
              🧺 বাজার যোগ
            </button>
          ) : null}
          {app.can("report.view") ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => app.setTab("report")}>
              📊 রিপোর্ট
            </button>
          ) : null}
        </div>
      </div>

      {/* কন্টেন্ট এডিটর এখন সব পেজে একই ভাসমান ✏️ এডিট বাটন থেকে খোলে */}

      {/* ── KPI — গ্রুপ করে সাজানো (spec §39, §85) ─────────────────── */}
      <div className="space-y-2">
        <div className="muted px-0.5 text-[11px] font-bold uppercase tracking-wide">🍚 মিল ও বাজার</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Kpi icon="👥" label="সক্রিয় সদস্য" value={String(s.activeMembers)} tone="brand" />
          <Kpi icon="🍚" label="মোট মিল" value={formatMeal(s.totalMill)} tone="brand" />
          <Kpi icon="⚖️" label="মিল রেট" value={`৳ ${formatRate(s.perMillRate)}`} tone="ok" />
          <Kpi icon="🧺" label="মোট বাজার" value={`৳ ${formatMoney(s.totalBazarCost)}`} tone="warn" />
          <Kpi icon="➕" label="অন্যান্য আয়" value={`৳ ${formatMoney(s.totalOthersIncome)}`} tone="ok" />
          <Kpi icon="🧮" label="নেট মিল খরচ" value={`৳ ${formatMoney(s.netCost)}`} tone="warn" />
        </div>

        <div className="muted px-0.5 pt-1 text-[11px] font-bold uppercase tracking-wide">💰 তহবিল ও অতিরিক্ত</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Kpi icon="🏦" label="স্থায়ী তহবিল" value={`৳ ${formatMoney(s.totalFund)}`} tone="brand" />
          <Kpi icon="🤝" label="শেয়ার্ড অতিরিক্ত" value={`৳ ${formatMoney(s.totalSharedExtra)}`} />
          <Kpi icon="👤" label="ইন্ডি. অতিরিক্ত" value={`৳ ${formatMoney(s.totalIndividualExtra)}`} />
          <Kpi icon="👜" label="নিজ টাকার বাজার" value={`৳ ${formatMoney(s.totalSelfPaidCredit ?? 0)}`} tone="brand" />
          <Kpi
            icon="🏁"
            label="লাস্ট ব্যালেন্স"
            value={`৳ ${formatMoney(s.lastBalance)}`}
            tone={s.lastBalance >= 0 ? "ok" : "danger"}
          />
        </div>

        <div className="muted px-0.5 pt-1 text-[11px] font-bold uppercase tracking-wide">📒 দেনা-পাওনা</div>
        <div className={`grid grid-cols-2 gap-2 ${(s.totalRemainingJer ?? 0) > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <Kpi icon="🔻" label="মোট দিবে" value={`৳ ${formatMoney(due)}`} tone="danger" />
          <Kpi icon="🔺" label="মোট পাবে" value={`৳ ${formatMoney(receive)}`} tone="ok" />
          <Kpi icon="✅" label="সমান" value={`${s.memberCalculations.filter((m) => m.statusEn === "Settled").length} জন`} tone="brand" />
          {(s.totalRemainingJer ?? 0) > 0 ? (
            <Kpi icon="⏳" label="বাকি জের" value={`৳ ${formatMoney(s.totalRemainingJer ?? 0)}`} tone="warn" />
          ) : null}
        </div>
      </div>

      {/* ── মিল ও বাজার টেবিল — পূর্ণ প্রস্থ, ভেতরে দুই-দিকে স্ক্রল ── */}
      <div className="space-y-3">
        {/* ── মিল টেবিল (মাসগ্রিড, রিড-ওনলি) — শুধু মিল-থাকা তারিখ ── */}
        <Card
          title="🍚 মিল টেবিল"
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => app.setTab("meals")}>
              দৈনিক মিল
            </button>
          }
        >
          {mealGrid.days.length === 0 ? (
            <EmptyState icon="🍚" title="এই মাসে কোনো মিল এন্ট্রি নেই" hint="দৈনিক ট্যাব থেকে মিল যোগ করুন।" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: "60vh", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="data" style={{ minWidth: "max-content", width: "100%" }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 bg-[var(--brand-soft)]">সদস্য</th>
                    {mealGrid.days.map((d) => (
                      <th key={d} className="num sticky top-0 z-10 bg-[var(--brand-soft)] text-center" style={{ minWidth: 34 }}>
                        {d}
                      </th>
                    ))}
                    <th className="num sticky top-0 z-10 bg-[var(--brand-soft)]" style={{ minWidth: 46 }}>মোট</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members
                    .filter((m) => (mealGrid.memberTotals[m.id] ?? 0) > 0)
                    .map((m) => (
                      <tr key={m.id}>
                        <td className="sticky left-0 z-10 bg-[var(--card)]">
                          <span className="block max-w-[96px] truncate text-[12.5px] font-bold">{m.name}</span>
                        </td>
                        {mealGrid.days.map((d) => {
                          const v = (mealGrid.byDay[d] ?? {})[m.id] ?? 0;
                          return (
                            <td key={d} className="num tabular-nums text-center">
                              {v ? formatMeal(v) : <span className="muted">—</span>}
                            </td>
                          );
                        })}
                        <td className="num font-bold tabular-nums">{formatMeal(mealGrid.memberTotals[m.id] ?? 0)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-10 bg-[var(--card)] font-bold">মোট</td>
                    {mealGrid.days.map((d) => (
                      <td key={d} className="num font-bold tabular-nums text-center">
                        {formatMeal(round2(Object.values(mealGrid.byDay[d] ?? {}).reduce((s2, v) => s2 + v, 0)))}
                      </td>
                    ))}
                    <td className="num font-extrabold tabular-nums">{formatMeal(mealGrid.grand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* ── বাজার টেবিল (তারিখভিত্তিক, রিড-ওনলি) ── */}
        <Card
          title="🧺 বাজার টেবিল"
          action={
            app.can("bazar.view") ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => app.setTab("bazar")}>
                সব দেখুন
              </button>
            ) : null
          }
        >
          {bazarRows.length === 0 ? (
            <EmptyState icon="🧺" title="এই মাসে কোনো বাজার এন্ট্রি নেই" hint="বাজার ট্যাব থেকে খরচ যোগ করুন।" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: "60vh", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="data" style={{ minWidth: 480, width: "100%" }}>
                <thead>
                  <tr>
                    <th className="num sticky top-0 z-10 bg-[var(--brand-soft)]" style={{ width: 36 }}>Sr</th>
                    <th className="sticky top-0 z-10 bg-[var(--brand-soft)]">তারিখ</th>
                    <th className="sticky top-0 z-10 bg-[var(--brand-soft)]">বাজারকারী</th>
                    <th className="sticky top-0 z-10 bg-[var(--brand-soft)]">আইটেম</th>
                    <th className="num sticky top-0 z-10 bg-[var(--brand-soft)]">টাকা</th>
                  </tr>
                </thead>
                <tbody>
                  {bazarRows.map((b, i) => (
                    <tr key={b.id}>
                      <td className="num muted tabular-nums">{i + 1}</td>
                      <td className="tabular-nums text-[12px]">{toDisplayDate(b.date)}</td>
                      <td>
                        <span className="block max-w-[90px] truncate text-[12.5px] font-semibold">{b.buyerName || "—"}</span>
                      </td>
                      <td>
                        <span className="block max-w-[340px] truncate text-[12.5px] sm:max-w-[520px]" title={b.items || b.category}>
                          {b.items || b.category}
                        </span>
                      </td>
                      <td className="num font-bold tabular-nums">৳ {formatMoney(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="font-bold">মোট</td>
                    <td className="num font-extrabold tabular-nums">৳ {formatMoney(s.totalBazarCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card
          title="💰 সদস্যের তহবিল / Fund"
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => app.setTab("fund")}>
              বিস্তারিত
            </button>
          }
        >
          <div className="space-y-1.5">
            {s.memberCalculations.map((m) => (
              <div key={m.memberId} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12.5px]">
                <span className="min-w-0 truncate font-semibold">{m.name}</span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--ok)]">৳ {formatMoney(m.permanentFund)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--brand-soft)] px-2.5 py-1.5 text-[12.5px]">
              <span className="font-bold">মোট স্থায়ী তহবিল</span>
              <span className="shrink-0 font-extrabold tabular-nums text-[var(--brand)]">৳ {formatMoney(s.totalFund)}</span>
            </div>
          </div>
        </Card>

        <Card title="গুগল শিট / Sync Status">
          <div className="space-y-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-2">
              <span className="muted">Apps Script</span>
              <Badge tone={app.office?.scriptUrl ? "ok" : "warn"}>{app.office?.scriptUrl ? "configured" : "not set"}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="muted">Google Sheet</span>
              <Badge tone={app.office?.sheetUrl ? "ok" : "warn"}>{app.office?.sheetUrl ? "linked" : "not linked"}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="muted">Last Synced</span>
              <span className="font-semibold">{app.office?.lastSyncedAt ? toDisplayDateTime(app.office.lastSyncedAt) : "—"}</span>
            </div>
            {app.can("sheet.sync") ? (
              <button type="button" className="btn btn-primary btn-sm w-full" disabled={app.syncBusy} onClick={() => void app.runSync()}>
                {app.syncBusy ? "Syncing…" : "☁ Full Sheet Sync"}
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => app.setTab("sheet")}>
                শিট সেটিংস দেখুন
              </button>
            )}
          </div>
        </Card>

        <Card title="হিসাবের নিয়ম / Rules">
          <ul className="space-y-1.5 text-[12px]">
            <li>• মিল রেট = (বাজার − অন্য আয়) ÷ মোট মিল</li>
            <li>• স্থায়ী ফান্ড = স্থায়ী মূলধন, মিল খরচ থেকে বাদ যায় না</li>
            <li>• Shared Extra = মোট ÷ সক্রিয় সদস্য সংখ্যা</li>
            <li>• Individual Extra শুধু নির্দিষ্ট সদস্যের হিসাবে</li>
            <li>• আগের মাসের বাকি (জের) নতুন মাসে নিজের টাকার বাজার বা নগদ পরিশোধ থেকে আগে সমন্বয় হয়</li>
            <li>• লাস্ট ব্যালেন্স = (মোট ফান্ড − অবশিষ্ট বকেয়া জের − নেট মিল খরচ) + নিজ টাকার বাজার; জের আদায়/সমন্বয় হলে বাড়ে</li>
            <li>• সদস্যের চলতি জমা দেনা-পাওনা মেটায় (হাত-নগদ বাড়ে), বাজার-মোট ও মিল রেট অপরিবর্তিত থাকে</li>
            <li>• প্রতি মাস আলাদা হিসাব — পুরনো মাস দেখা যাবে, মুছে যাবে না</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
