"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { GuideLine } from "@/components/GuideLine";
import { Badge, Card, EmptyState, Kpi, Loader, Modal } from "@/components/ui";
import { mess } from "@/lib/client";
import { formatMeal, formatMoney, formatRate, round2 } from "@/lib/format";
import { isoOfDay, monthLabelBn, toDisplayDate, toDisplayDateTime } from "@/lib/date";
import { bazarByCategory, bazarByBuyer } from "@/lib/calc";
import { CSV_VARIANTS } from "@/lib/report-csv";
import type { DepositDTO, MemberCalculation, MessData, MonthDTO, MonthSummary } from "@/lib/types";

interface ReportResponse {
  office: { id: string; name: string; branch: string; code: string } | null;
  month: MonthDTO;
  fromDate: string | null;
  toDate: string | null;
  summary: MonthSummary;
  data: MessData;
  selfOnly: boolean;
  generatedAt: string;
}

/* ══════════════════════════════════════════════════════════
 *  সাইনড টাকা রেন্ডার — ঋণাত্মক লাল (দেনা), ধনাত্মক সবুজ (পাওনা)
 * ══════════════════════════════════════════════════════════ */

function SignedMoney({ value, bold = false }: { value: number; bold?: boolean }) {
  const color = value < -0.005 ? "var(--danger)" : value > 0.005 ? "var(--ok)" : "var(--muted)";
  return (
    <span className={`tabular-nums ${bold ? "font-extrabold" : ""}`} style={{ color }}>
      {value < -0.005 ? "−" : value > 0.005 ? "+" : ""}
      ৳{formatMoney(Math.abs(value))}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════
 *  দেনা-পাওনার জমা (ইনলাইন) — সদস্য টেবিলের ভেতরেই বসানো যায়।
 *  সংরক্ষিত জমা দেনা কমায়; অবশিষ্টটাই পরের মাসে জের হিসেবে যায়।
 *  প্রতি সদস্যের একটিই closing_payment থাকে — পুরোনোটি হালনাগাদ/মুছে
 *  নতুন পরিমাণ বসানো হয়।
 * ══════════════════════════════════════════════════════════ */

function ClosingPaymentCell({
  month,
  member,
  paid,
  existing,
  canWrite,
  onSaved,
}: {
  month: MonthDTO;
  member: MemberCalculation;
  paid: number;
  existing: DepositDTO[];
  canWrite: boolean;
  onSaved: () => void;
}) {
  const app = useApp();
  const [raw, setRaw] = useState(paid > 0 ? String(paid) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRaw(paid > 0 ? String(paid) : "");
  }, [paid]);

  const amount = round2(Number(raw.trim()) || 0);
  const dirty = Math.abs(amount - round2(paid)) > 0.005;
  const lastDay = isoOfDay(month.year, month.month, month.totalDays);
  const note = `দেনা-পাওনার জমা (${month.monthName})`;

  const save = async () => {
    if (!Number.isFinite(amount) || amount < 0) {
      app.toast("সঠিক পরিমাণ লিখুন (০ বা তার বেশি)", "error");
      return;
    }
    setBusy(true);
    let res: unknown = null;
    if (amount <= 0.005) {
      // জমা শূন্য — আগের সব মাস-শেষ জমা মুছে ফেলা হয়
      for (const d of existing) {
        res = await app.call("deposit.delete", { id: d.id });
      }
      if (existing.length === 0) res = true;
    } else if (existing.length > 0) {
      // একটি থাকলে হালনাগাদ, একাধিক থাকলে বাকিগুলো মুছে ফেলা হয়
      const [first, ...rest] = existing;
      res = await app.call("deposit.update", {
        id: first.id,
        memberId: member.memberId,
        memberName: member.name,
        amount,
        date: first.date || lastDay,
        type: "closing_payment",
        note,
      });
      for (const d of rest) await app.call("deposit.delete", { id: d.id });
    } else {
      res = await app.call("deposit.create", {
        monthId: month.id,
        memberId: member.memberId,
        memberName: member.name,
        amount,
        date: lastDay,
        type: "closing_payment",
        note,
      });
    }
    setBusy(false);
    if (!res) return;
    app.toast(`${member.name} — দেনা-পাওনার জমা ৳${formatMoney(amount)} সংরক্ষিত হয়েছে ✓`, "success");
    onSaved();
  };

  if (!canWrite) {
    return <span className="tabular-nums">{paid > 0 ? `৳${formatMoney(paid)}` : "—"}</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        className="input h-7 w-[72px] px-1.5 text-right tabular-nums sm:w-20"
        value={raw}
        disabled={busy}
        placeholder="0"
        onChange={(e) => setRaw(e.target.value)}
        aria-label={`${member.name} এর দেনা-পাওনার জমা`}
      />
      {dirty ? (
        <button
          type="button"
          className="btn btn-primary btn-sm h-7 min-h-0 px-2"
          disabled={busy}
          onClick={() => void save()}
          title="জমা সংরক্ষণ করুন"
        >
          {busy ? "…" : "✓"}
        </button>
      ) : null}
    </div>
  );
}

export function ReportView() {
  const app = useApp();
  const month = app.month;

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvOpen, setCsvOpen] = useState(false);
  const [selfOnly, setSelfOnly] = useState(false);

  const summary = report?.summary ?? app.summary;
  const data = report?.data ?? app.data;

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      const res = await mess<ReportResponse>("report.summary", {
        monthId: month.id,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setReport(res);
      setSelfOnly(Boolean(res?.selfOnly));
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "রিপোর্ট লোড করা যায়নি", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month?.id, fromDate, toDate]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month?.id]);

  useEffect(() => {
    if (!month) return;
    setFromDate(isoOfDay(month.year, month.month, 1));
    setToDate(isoOfDay(month.year, month.month, month.totalDays));
  }, [month?.id, month?.year, month?.month, month?.totalDays]);

  const categories = useMemo(() => (data ? bazarByCategory(data.bazarExpenses) : {}), [data]);
  const buyers = useMemo(() => (data ? bazarByBuyer(data.bazarExpenses) : {}), [data]);

  // সদস্যভিত্তিক “দেনা-পাওনার জমা” (closing_payment) — টেবিলের ইনলাইন ঘরে বসে
  const closingMap = useMemo(() => {
    const map: Record<string, { paid: number; items: DepositDTO[] }> = {};
    for (const d of data?.deposits ?? []) {
      if (d.type !== "closing_payment" || !d.memberId) continue;
      const entry = (map[d.memberId] ??= { paid: 0, items: [] });
      entry.paid = round2(entry.paid + Number(d.amount));
      entry.items.push(d);
    }
    return map;
  }, [data]);

  if (!month || !summary) return <Loader label="Loading report…" />;

  const calcs = summary.memberCalculations ?? [];
  const totalDue = round2(calcs.filter((m) => m.statusEn === "Due").reduce((s, m) => s + Math.abs(m.denaPoana), 0));
  const totalReceive = round2(calcs.filter((m) => m.statusEn === "Receive").reduce((s, m) => s + m.denaPoana, 0));
  const totalCost = round2(calcs.reduce((s, m) => s + m.totalCost, 0));
  const hasJer = (summary.totalOpeningDue ?? 0) > 0;
  // ইনলাইন জমা কলামের যোগফল ও জমা-পূর্ব দেনা/পাওনা
  const closingOf = (m: MemberCalculation) => round2(closingMap[m.memberId]?.paid ?? 0);
  const totalClosing = round2(calcs.reduce((s, m) => s + closingOf(m), 0));
  const beforeRows = calcs.map((m) => round2(m.denaPoana - closingOf(m)));
  const totalBeforeDue = round2(beforeRows.filter((v) => v < -0.005).reduce((s, v) => s + Math.abs(v), 0));
  const totalBeforeReceive = round2(beforeRows.filter((v) => v > 0.005).reduce((s, v) => s + v, 0));

  const exportUrl = (format: string, variant = "full") => {
    const params = new URLSearchParams({ format, variant, monthId: month.id });
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    return `/api/report/export?${params.toString()}`;
  };

  const downloadPdf = () => {
    const url = exportUrl("html");
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = url;
      app.toast("পপ-আপ ব্লক হয়েছে — নতুন ট্যাবে রিপোর্ট খোলা হচ্ছে", "info");
      return;
    }
    app.toast("রিপোর্ট খুলেছে — প্রিন্ট ডায়ালগ থেকে “Save as PDF” নির্বাচন করুন", "info");
  };

  // জমা ইনপুট শুধু পুরো মাসের ভিউতে — ফিল্টার করা ভিউতে জমা এন্ট্রির তালিকা আংশিক থাকে
  const fullMonth =
    fromDate === isoOfDay(month.year, month.month, 1) &&
    toDate === isoOfDay(month.year, month.month, month.totalDays);
  const canWriteFund = app.can("fund.write") && fullMonth;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[17px] font-extrabold leading-tight">
          মাসিক রিপোর্ট <span className="muted font-bold">• {month.monthName}</span>
        </h1>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-primary btn-sm" onClick={downloadPdf}>
            ⬇ Download PDF
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCsvOpen(true)}>
            ⬇ Download CSV
          </button>
        </div>
      </div>

      {selfOnly ? (
        <div className="rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--brand)]">
          👤 আপনি সদস্য রোল ব্যবহার করছেন — শুধু আপনার নিজের হিসাব দেখানো হচ্ছে।
        </div>
      ) : null}

      <Card title="তারিখ ফিল্টার" bodyClass="p-2.5 sm:p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[140px] flex-1">
            <span className="label">শুরু</span>
            <input
              type="date"
              className="input h-9"
              value={fromDate}
              min={isoOfDay(month.year, month.month, 1)}
              max={isoOfDay(month.year, month.month, month.totalDays)}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="block min-w-[140px] flex-1">
            <span className="label">শেষ</span>
            <input
              type="date"
              className="input h-9"
              value={toDate}
              min={isoOfDay(month.year, month.month, 1)}
              max={isoOfDay(month.year, month.month, month.totalDays)}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              দেখুন
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setReport(null);
              }}
            >
              পুরো মাস
            </button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading report…" />
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="সক্রিয় সদস্য" value={String(summary.activeMembers)} tone="brand" />
            <Kpi label="মোট মিল" value={formatMeal(summary.totalMill)} />
            <Kpi label="মিল রেট" value={`৳ ${formatRate(summary.perMillRate)}`} tone="ok" />
            <Kpi label="মোট বাজার" value={`৳ ${formatMoney(summary.totalBazarCost)}`} />
            <Kpi label="অন্যান্য আয়" value={`৳ ${formatMoney(summary.totalOthersIncome)}`} />
            <Kpi label="নেট মিল খরচ" value={`৳ ${formatMoney(summary.netCost)}`} />
            <Kpi label="স্থায়ী তহবিল" value={`৳ ${formatMoney(summary.totalFund)}`} tone="warn" />
            <Kpi label="শেয়ার্ড অতিরিক্ত" value={`৳ ${formatMoney(summary.totalSharedExtra)}`} />
            <Kpi label="ইন্ডি. অতিরিক্ত" value={`৳ ${formatMoney(summary.totalIndividualExtra)}`} />
            <Kpi label="লাস্ট ব্যালেন্স" value={`৳ ${formatMoney(summary.lastBalance)}`} tone={summary.lastBalance >= 0 ? "ok" : "danger"} />
          </div>

          {/* ── member report table (spec §40) ──────── */}
          <Card
            title="সদস্য হিসাব"
            bodyClass="p-0"
          >
            {calcs.length === 0 ? (
              <div className="p-3">
                <EmptyState icon="👥" title="কোনো সদস্য পাওয়া যায়নি" hint="সদস্য যোগ করলে রিপোর্ট তৈরি হবে।" />
              </div>
            ) : (
              <div className="table-wrap" style={{ borderRadius: 0, borderWidth: 0 }}>
                <table className="data report-table" style={{ minWidth: hasJer ? 980 : 760 }}>
                  <thead>
                    <tr>
                      <th>সদস্য</th>
                      <th className="num vth">মোট<br/>মিল</th>
                      <th className="num vth">মিল<br/>রেট</th>
                      <th className="num vth">মিল<br/>খরচ</th>
                      <th className="num vth">ইন্ডি.<br/>অতিরিক্ত</th>
                      <th className="num vth">শেয়ার্ড<br/>অতিরিক্ত</th>
                      <th className="num vth">মোট<br/>খরচ (−)</th>
                      <th className="num vth">জমা/<br/>সমন্বয়</th>
                      <th className="num vth">নিজ টাকায়<br/>বাজার</th>
                      {hasJer ? (
                        <>
                          <th className="num vth">প্রারম্ভিক<br/>জের</th>
                          <th className="num vth">জের<br/>সমন্বয়</th>
                          <th className="num vth">বাকি<br/>জের</th>
                        </>
                      ) : null}
                      <th className="num vth" title="জমা বসানোর আগের হিসাব">
                        দেনা(−)/<br/>পাওনা(+)
                      </th>
                      <th className="num vth">দেনা-পাওনার<br/>জমা (৳)</th>
                      <th className="num vth" title="হিসাব − জমা = অবশিষ্ট; এটাই পরের মাসে জের হিসেবে যায়">
                        অবশিষ্ট<br/>দেনা-পাওনা
                      </th>
                      <th className="num vth">স্থায়ী<br/>ফান্ড</th>
                      <th className="vth text-center">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcs.map((m) => {
                      const closing = closingMap[m.memberId];
                      const closingPaid = round2(closing?.paid ?? 0);
                      // হিসাব − জমা = অবশিষ্ট (denaPoana)
                      const dueBefore = round2(m.denaPoana - closingPaid);
                      return (
                      <tr key={m.memberId}>
                        <td>
                          <span className="block font-bold">{m.name}</span>
                          <span className="cell-sub muted block text-[10.5px]">
                            {m.role}
                            {m.phone ? ` • ${m.phone}` : ""}
                            {m.isActive ? "" : " • নিষ্ক্রিয়"}
                          </span>
                        </td>
                        <td className="num tabular-nums">{formatMeal(m.totalMill)}</td>
                        <td className="num tabular-nums">{formatRate(m.perMillRate)}</td>
                        <td className="num tabular-nums">{formatMoney(m.mealCost)}</td>
                        <td className="num tabular-nums">{formatMoney(m.individualExtra)}</td>
                        <td className="num tabular-nums">{formatMoney(m.sharedExtra)}</td>
                        <td className="num font-bold tabular-nums text-[var(--danger)]">−৳{formatMoney(m.totalCost)}</td>
                        <td className="num tabular-nums text-[var(--ok)]">+৳{formatMoney(m.totalDeposit)}</td>
                        <td className="num tabular-nums text-[var(--ok)]">
                          {m.selfPaidBazar > 0 ? (
                            <>
                              +৳{formatMoney(m.selfPaidBazar)}
                              {(m.selfPaidCredit ?? m.selfPaidBazar) < m.selfPaidBazar - 0.005 ? (
                                <span className="cell-sub muted block text-[10px]">
                                  ক্রেডিট ৳{formatMoney(m.selfPaidCredit ?? 0)}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        {hasJer ? (
                          <>
                            <td className="num tabular-nums">
                              {(m.openingDue ?? 0) > 0 ? `৳${formatMoney(m.openingDue ?? 0)}` : "—"}
                            </td>
                            <td className="num tabular-nums text-[var(--ok)]" title={`বাজার থেকে ৳${formatMoney(m.jerAdjusted ?? 0)} + নগদে ৳${formatMoney(m.jerCashPaid ?? 0)}`}>
                              {(m.jerAdjusted ?? 0) + (m.jerCashPaid ?? 0) > 0
                                ? `৳${formatMoney((m.jerAdjusted ?? 0) + (m.jerCashPaid ?? 0))}`
                                : "—"}
                            </td>
                            <td className="num font-bold tabular-nums text-[var(--warn)]">
                              {(m.remainingJer ?? 0) > 0 ? `৳${formatMoney(m.remainingJer ?? 0)}` : "—"}
                            </td>
                          </>
                        ) : null}
                        <td className="num tabular-nums">
                          <SignedMoney value={dueBefore} />
                        </td>
                        <td className="num">
                          <ClosingPaymentCell
                            month={month}
                            member={m}
                            paid={closingPaid}
                            existing={closing?.items ?? []}
                            canWrite={canWriteFund}
                            onSaved={() => void load()}
                          />
                        </td>
                        <td className="num tabular-nums" style={{ background: "var(--brand-soft)" }}>
                          <SignedMoney value={m.denaPoana} bold />
                        </td>
                        <td className="num tabular-nums text-[var(--brand)]">৳{formatMoney(m.permanentFund)}</td>
                        <td className="text-center">
                          <Badge tone={m.statusEn === "Due" ? "danger" : m.statusEn === "Receive" ? "ok" : "muted"}>
                            {m.statusEn}
                          </Badge>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>মোট</td>
                      <td className="num tabular-nums">{formatMeal(summary.totalMill)}</td>
                      <td className="num tabular-nums">{formatRate(summary.perMillRate)}</td>
                      <td className="num tabular-nums">{formatMoney(round2(calcs.reduce((s, m) => s + m.mealCost, 0)))}</td>
                      <td className="num tabular-nums">{formatMoney(summary.totalIndividualExtra)}</td>
                      <td className="num tabular-nums">{formatMoney(summary.totalSharedExtra)}</td>
                      <td className="num tabular-nums">−৳{formatMoney(totalCost)}</td>
                      <td className="num tabular-nums">৳{formatMoney(calcs.reduce((s, m) => s + m.totalDeposit, 0))}</td>
                      <td className="num tabular-nums">৳{formatMoney(summary.totalSelfPaidBazar)}</td>
                      {hasJer ? (
                        <>
                          <td className="num tabular-nums">৳{formatMoney(summary.totalOpeningDue ?? 0)}</td>
                          <td className="num tabular-nums">
                            ৳{formatMoney((summary.totalJerAdjusted ?? 0) + (summary.totalJerCashPaid ?? 0))}
                          </td>
                          <td className="num tabular-nums">৳{formatMoney(summary.totalRemainingJer ?? 0)}</td>
                        </>
                      ) : null}
                      <td className="num tabular-nums">
                        দিবে ৳{formatMoney(totalBeforeDue)}
                        <br />
                        পাবে ৳{formatMoney(totalBeforeReceive)}
                      </td>
                      <td className="num tabular-nums text-[var(--brand)]">৳{formatMoney(totalClosing)}</td>
                      <td className="num font-extrabold tabular-nums" style={{ background: "var(--brand-soft)" }}>
                        দিবে ৳{formatMoney(totalDue)}
                        <br />
                        পাবে ৳{formatMoney(totalReceive)}
                      </td>
                      <td className="num tabular-nums">৳{formatMoney(summary.totalFund)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {/* ── bazar + income summary ──────────────── */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="বাজার সামারি" bodyClass="p-3">
              {Object.keys(categories).length === 0 ? (
                <EmptyState icon="🧺" title="এই মাসে কোনো বাজার এন্ট্রি নেই" />
              ) : (
                <>
                  <div className="space-y-1">
                    {Object.entries(categories)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="font-semibold">{k}</span>
                          <span className="tabular-nums">৳ {formatMoney(v)}</span>
                        </div>
                      ))}
                  </div>
                  <div className="mt-2 border-t border-[var(--border)] pt-2 text-[13px] font-bold">
                    <div className="flex justify-between">
                      <span>মোট বাজার</span>
                      <span className="tabular-nums">৳ {formatMoney(summary.totalBazarCost)}</span>
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="muted cursor-pointer text-[12px] font-semibold">ক্রেতা অনুযায়ী দেখুন</summary>
                    <div className="mt-1.5 space-y-1">
                      {Object.entries(buyers)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-2 text-[12px]">
                            <span>{k}</span>
                            <span className="tabular-nums">৳ {formatMoney(v)}</span>
                          </div>
                        ))}
                    </div>
                  </details>
                </>
              )}
            </Card>

            <Card title="দেনা-পাওনা সারাংশ" bodyClass="p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)]/50 p-2">
                  <div className="text-[11px] font-bold text-[var(--danger)]">দিবে / Due</div>
                  <div className="text-[16px] font-extrabold tabular-nums text-[var(--danger)]">৳ {formatMoney(totalDue)}</div>
                  <div className="muted text-[10.5px]">{calcs.filter((m) => m.statusEn === "Due").length} জন</div>
                </div>
                <div className="rounded-lg border border-[var(--ok)] bg-[var(--ok-soft)]/50 p-2">
                  <div className="text-[11px] font-bold text-[var(--ok)]">পাবে / Receive</div>
                  <div className="text-[16px] font-extrabold tabular-nums text-[var(--ok)]">৳ {formatMoney(totalReceive)}</div>
                  <div className="muted text-[10.5px]">{calcs.filter((m) => m.statusEn === "Receive").length} জন</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] p-2">
                  <div className="muted text-[11px] font-bold">সমান / Settled</div>
                  <div className="text-[16px] font-extrabold tabular-nums">{calcs.filter((m) => m.statusEn === "Settled").length}</div>
                  <div className="muted text-[10.5px]">জন</div>
                </div>
              </div>
              
            </Card>
          </div>

        </>
      )}

      {/* ── CSV modal ─────────────────────────────── */}
      <Modal
        open={csvOpen}
        title="CSV ডাউনলোড"
        subtitle="যে অংশটি এক্সপোর্ট করতে চান বেছে নিন"
        onClose={() => setCsvOpen(false)}
      >
        <div className="space-y-2">
          {Object.entries(CSV_VARIANTS).map(([key, v]) => (
            <a key={key} href={exportUrl("csv", key)} className="btn btn-ghost w-full justify-between" download>
              <span>{v.label}</span>
              <span className="muted text-[11px]">.csv</span>
            </a>
          ))}
        </div>
      </Modal>
    </div>
  );
}
