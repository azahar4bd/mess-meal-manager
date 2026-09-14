"use client";

import React, { useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { UiContentEditor, useUiContent } from "@/components/UiContent";
import { Badge, Card, EmptyState, Kpi, Loader } from "@/components/ui";
import { formatMeal, formatMoney, formatRate, round2 } from "@/lib/format";
import { toDisplayDate, toDisplayDateTime, monthLabelBn, todayIso } from "@/lib/date";

export function DashboardView() {
  const app = useApp();
  const s = app.summary;
  const data = app.data;
  const { texts } = useUiContent(app.office?.id ?? null);
  const [editorOpen, setEditorOpen] = useState(false);

  const topMembers = useMemo(() => {
    if (!s) return [];
    return [...s.memberCalculations].sort((a, b) => b.totalMill - a.totalMill).slice(0, 5);
  }, [s]);

  const recentBazar = useMemo(() => (data ? [...data.bazarExpenses].slice(0, 5) : []), [data]);
  const recentDeposits = useMemo(() => (data ? [...data.deposits].slice(0, 4) : []), [data]);

  if (!s || !data || !app.month) return <Loader label="Loading dashboard…" />;

  const due = round2(s.memberCalculations.filter((m) => m.statusEn === "Due").reduce((a, m) => a + Math.abs(m.denaPoana), 0));
  const receive = round2(s.memberCalculations.filter((m) => m.statusEn === "Receive").reduce((a, m) => a + m.denaPoana, 0));
  const daysWithMeals = new Set(data.dailyMeals.map((m) => m.day)).size;

  /* ── বর্তমান কাজের অবস্থা — ড্যাশবোর্ড ইন্ডিকেটর ── */
  const today = todayIso();
  const inThisMonth = today.startsWith(`${app.month.year}-${String(app.month.month).padStart(2, "0")}`);
  const todayDay = inThisMonth ? Number(today.slice(-2)) : null;
  const todayMeals = todayDay ? data.dailyMeals.some((m) => m.day === todayDay) : null;
  const todayBazar = todayDay ? data.bazarExpenses.some((b) => b.day === todayDay) : null;
  const sync = app.office ? { scriptConfigured: Boolean(app.office.scriptUrl), lastSyncedAt: app.office.lastSyncedAt } : null;
  const tasks: { label: string; hint: string; done: boolean | null; tab?: string }[] = [
    {
      label: todayMeals === null ? "আজকের মিল এন্ট্রি (এই মাসে নয়)" : "আজকের মিল এন্ট্রি",
      hint: todayMeals === null ? "—" : todayMeals ? "হয়ে গেছে" : "বাকি আছে",
      done: todayMeals,
      tab: "meals",
    },
    {
      label: todayBazar === null ? "আজকের বাজার এন্ট্রি (এই মাসে নয়)" : "আজকের বাজার এন্ট্রি",
      hint: todayBazar === null ? "—" : todayBazar ? "হয়ে গেছে" : "দেওয়া হয়নি",
      done: todayBazar,
      tab: "bazar",
    },
    {
      label: "মাসের মিল কভারেজ",
      hint: `${daysWithMeals}/${app.month.totalDays} দিন`,
      done: daysWithMeals >= app.month.totalDays,
      tab: "meals",
    },
    {
      label: "বাজার এন্ট্রি",
      hint: `${data.bazarExpenses.length}টি • মোট ৳ ${Math.round(s.totalBazarCost)}`,
      done: data.bazarExpenses.length > 0,
      tab: "bazar",
    },
    {
      label: "স্থায়ী তহবিল / জমা",
      hint: `${data.deposits.length}টি এন্ট্রি`,
      done: data.deposits.length > 0,
      tab: "fund",
    },
    {
      label: "Google Sheet সিঙ্ক",
      hint: sync?.scriptConfigured
        ? sync.lastSyncedAt
          ? `শেষ সিঙ্ক ${toDisplayDateTime(sync.lastSyncedAt)}`
          : "কনফিগার করা, এখনো সিঙ্ক হয়নি"
        : "কনফিগার করা নেই",
      done: sync?.scriptConfigured ? Boolean(sync.lastSyncedAt) : null,
      tab: "sheet",
    },
    {
      label: "মাসের অবস্থা",
      hint: app.month.isClosed ? "বন্ধ — শুধু দেখা যাবে" : "খোলা — এন্ট্রি দেওয়া যাবে",
      done: app.month.isClosed ? null : true,
      tab: "month",
    },
  ];
  const pending = tasks.filter((t) => t.done === false).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-[19px] font-extrabold leading-tight">{texts.dashboardTitle || "ড্যাশবোর্ড / Dashboard"}</h1>
            {app.can("settings.write") ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm h-7 w-7 shrink-0 px-0 text-[13px]"
                title="হেডার/সাবটাইটেল ও নোটিশ বোর্ড এডিট করুন"
                aria-label="টেক্সট ও নোটিশ এডিট করুন"
                onClick={() => setEditorOpen(true)}
              >
                ✎
              </button>
            ) : null}
          </div>
          <p className="muted text-[12.5px]">
            {app.office?.name}
            {app.office?.branch ? ` • ${app.office.branch}` : ""} • {app.month.monthName} ({monthLabelBn(app.month.year, app.month.month)})
            {app.month.isClosed ? " • 🔒 বন্ধ" : ""}
          </p>
          {texts.dashboardSubtitle ? <p className="mt-0.5 text-[12.5px] font-semibold text-[var(--brand)]">{texts.dashboardSubtitle}</p> : null}
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

      {/* ── বর্তমান অবস্থান / কাজের ইন্ডিকেটর ─────────────────── */}
      <Card bodyClass="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-extrabold">🧭 আপনি এখন যে কাজে আছেন</span>
          <Badge tone="brand">{app.month.monthName}</Badge>
          <Badge tone={app.month.isClosed ? "danger" : "ok"}>{app.month.isClosed ? "মাস বন্ধ 🔒" : "মাস খোলা"}</Badge>
          <Badge tone={pending ? "warn" : "muted"}>{pending ? `${pending}টি কাজ বাকি` : "সব কাজ শেষ ✓"}</Badge>
          <span className="muted text-[11.5px]">
            {app.office?.name} • {app.role === "admin" ? "প্ল্যাটফর্ম অ্যাডমিন" : app.role === "manager" ? "ম্যানেজার" : app.role === "audit" ? "অডিট" : "সদস্য"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => t.tab && app.setTab(t.tab)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 text-left text-[12.5px] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"
            >
              <span aria-hidden className="text-[13px]">
                {t.done === true ? "✅" : t.done === false ? "⬜" : "ℹ️"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{t.label}</span>
                <span className="muted block truncate text-[11px]">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {app.can("settings.write") ? <UiContentEditor open={editorOpen} onClose={() => setEditorOpen(false)} scope="office" /> : null}

      {/* ── KPI grid (spec §39, §85) ─────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="সক্রিয় সদস্য / Active Members" value={String(s.activeMembers)} sub={`মোট ${s.totalMembers} জন`} tone="brand" />
        <Kpi label="মোট মিল / Total Meals" value={formatMeal(s.totalMill)} sub={`${daysWithMeals}/${app.month.totalDays} দিনে এন্ট্রি`} />
        <Kpi label="মিল রেট / Meal Rate" value={`৳ ${formatRate(s.perMillRate)}`} sub="প্রতি মিল" tone="ok" />
        <Kpi label="মোট বাজার / Total Bazar" value={`৳ ${formatMoney(s.totalBazarCost)}`} sub={`${data.bazarExpenses.length} এন্ট্রি`} />
        <Kpi label="অন্যান্য আয় / Other Income" value={`৳ ${formatMoney(s.totalOthersIncome)}`} sub={`${data.otherIncomes.length} এন্ট্রি`} tone="ok" />
        <Kpi label="নেট মিল খরচ / Net Meal Cost" value={`৳ ${formatMoney(s.netCost)}`} sub="বাজার − আয়" />
        <Kpi label="স্থায়ী তহবিল / Permanent Fund" value={`৳ ${formatMoney(s.totalFund)}`} sub="মিল খরচ থেকে বাদ যায় না" tone="warn" />
        <Kpi label="শেয়ার্ড অতিরিক্ত / Shared Extra" value={`৳ ${formatMoney(s.totalSharedExtra)}`} sub={`জনপ্রতি ৳ ${formatMoney(s.activeMembers ? s.totalSharedExtra / s.activeMembers : 0)}`} />
        <Kpi label="ইন্ডিভিজুয়াল অতিরিক্ত" value={`৳ ${formatMoney(s.totalIndividualExtra)}`} sub={`${data.extraExpenses.filter((e) => e.type === "individual").length} এন্ট্রি`} />
        <Kpi
          label="লাস্ট ব্যালেন্স / Last Balance"
          value={`৳ ${formatMoney(s.lastBalance)}`}
          sub="ফান্ড − (বাজার + অতিরিক্ত − আয়)"
          tone={s.lastBalance >= 0 ? "ok" : "danger"}
        />
      </div>

      {/* ── dena paona snapshot ─────────────────────── */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Card className="border-l-4 border-l-[var(--danger)]" bodyClass="p-3">
          <div className="kpi-k">মোট দিবে (Due)</div>
          <div className="kpi-v text-[var(--danger)]">৳ {formatMoney(due)}</div>
          <div className="muted text-[11px]">{s.memberCalculations.filter((m) => m.statusEn === "Due").length} জন সদস্য</div>
        </Card>
        <Card className="border-l-4 border-l-[var(--ok)]" bodyClass="p-3">
          <div className="kpi-k">মোট পাবে (Receive)</div>
          <div className="kpi-v text-[var(--ok)]">৳ {formatMoney(receive)}</div>
          <div className="muted text-[11px]">{s.memberCalculations.filter((m) => m.statusEn === "Receive").length} জন সদস্য</div>
        </Card>
        <Card className="border-l-4 border-l-[var(--brand)]" bodyClass="p-3">
          <div className="kpi-k">সমান (Settled)</div>
          <div className="kpi-v">{s.memberCalculations.filter((m) => m.statusEn === "Settled").length} জন</div>
          <div className="muted text-[11px]">জমা = খরচ</div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── top members ─────────────────────────── */}
        <Card
          title="সর্বোচ্চ মিল / Top Meals"
          subtitle="এই মাসের হিসাব"
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => app.setTab("report")}>
              পূর্ণ রিপোর্ট
            </button>
          }
        >
          {topMembers.length === 0 ? (
            <EmptyState icon="👥" title="কোনো সদস্য পাওয়া যায়নি" hint="সদস্য যোগ করুন" />
          ) : (
            <div className="space-y-1.5">
              {topMembers.map((m, i) => (
                <div key={m.memberId} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[12px] font-bold text-[var(--brand)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{m.name}</span>
                    <span className="muted block text-[11px]">
                      মিল খরচ ৳ {formatMoney(m.totalCost)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[14px] font-extrabold tabular-nums">{formatMeal(m.totalMill)}</span>
                    <span className="muted block text-[10.5px]">মিল</span>
                  </span>
                  <Badge tone={m.statusEn === "Due" ? "danger" : m.statusEn === "Receive" ? "ok" : "muted"}>{m.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── recent bazar ────────────────────────── */}
        <Card
          title="সাম্প্রতিক বাজার / Recent Bazar"
          action={
            app.can("bazar.view") ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => app.setTab("bazar")}>
                সব দেখুন
              </button>
            ) : null
          }
        >
          {recentBazar.length === 0 ? (
            <EmptyState icon="🧺" title="এই মাসে কোনো বাজার এন্ট্রি নেই" hint="বাজার ট্যাব থেকে খরচ যোগ করুন।" />
          ) : (
            <div className="space-y-1.5">
              {recentBazar.map((b) => (
                <div key={b.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
                  <span className="muted w-[74px] shrink-0 text-[11.5px] tabular-nums">{toDisplayDate(b.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{b.items || b.category}</span>
                    <span className="muted block truncate text-[11px]">
                      {b.buyerName || "—"} • {b.category}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-bold tabular-nums">৳ {formatMoney(b.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="সাম্প্রতিক জমা / Recent Fund">
          {recentDeposits.length === 0 ? (
            <EmptyState icon="💰" title="কোনো জমা এন্ট্রি নেই" />
          ) : (
            <div className="space-y-1.5">
              {recentDeposits.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12.5px]">
                  <span className="min-w-0 truncate font-semibold">{d.memberName || "—"}</span>
                  <span className="muted shrink-0 text-[11px]">{toDisplayDate(d.date)}</span>
                  <span className="shrink-0 font-bold tabular-nums text-[var(--ok)]">৳ {formatMoney(d.amount)}</span>
                </div>
              ))}
            </div>
          )}
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
            <li>• প্রতি মাস আলাদা হিসাব — পুরনো মাস দেখা যাবে, মুছে যাবে না</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
