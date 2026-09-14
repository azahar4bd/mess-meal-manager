"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { GuideLine } from "@/components/GuideLine";
import { Badge, Card, ConfirmDialog, EmptyState, Kpi, Loader, Modal } from "@/components/ui";
import { mess } from "@/lib/client";
import { formatMeal, formatMoney, formatRate, round2 } from "@/lib/format";
import { isoOfDay, monthLabelBn, toDisplayDate, toDisplayDateTime } from "@/lib/date";
import { bazarByCategory, bazarByBuyer } from "@/lib/calc";
import { CSV_VARIANTS } from "@/lib/report-csv";
import type { MessData, MonthDTO, MonthSummary } from "@/lib/types";

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

export function ReportView() {
  const app = useApp();
  const month = app.month;

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvOpen, setCsvOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
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

  if (!month || !summary) return <Loader label="Loading report…" />;

  const calcs = summary.memberCalculations ?? [];
  const totalDue = round2(calcs.filter((m) => m.statusEn === "Due").reduce((s, m) => s + Math.abs(m.denaPoana), 0));
  const totalReceive = round2(calcs.filter((m) => m.statusEn === "Receive").reduce((s, m) => s + m.denaPoana, 0));
  const totalCost = round2(calcs.reduce((s, m) => s + m.totalCost, 0));

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

  const toggleClose = async () => {
    setCloseBusy(true);
    const res = await app.call<MonthDTO>("month.close", { monthId: month.id, closed: !month.isClosed });
    setCloseBusy(false);
    setCloseOpen(false);
    if (res) {
      app.toast(res.isClosed ? "মাসটি বন্ধ করা হয়েছে 🔒" : "মাসটি পুনরায় খোলা হয়েছে 🔓", "success");
      await app.bootstrap();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[19px] font-extrabold leading-tight">মাসিক হিসাব রিপোর্ট / Monthly Report</h1>
          <p className="muted text-[12.5px]">
            {app.office?.name} • {month.monthName} ({monthLabelBn(month.year, month.month)}) •{" "}
            {toDisplayDate(fromDate || isoOfDay(month.year, month.month, 1))} — {toDisplayDate(toDate || isoOfDay(month.year, month.month, month.totalDays))}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-primary btn-sm" onClick={downloadPdf}>
            ⬇ Download PDF
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCsvOpen(true)}>
            ⬇ Download CSV
          </button>
          {app.can("month.write") ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCloseOpen(true)}>
              {month.isClosed ? "🔓 মাস খুলুন" : "🔒 মাস বন্ধ করুন"}
            </button>
          ) : null}
        </div>
      </div>

      {selfOnly ? (
        <div className="rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--brand)]">
          👤 আপনি সদস্য রোল ব্যবহার করছেন — শুধু আপনার নিজের হিসাব দেখানো হচ্ছে।
        </div>
      ) : null}

      {/* ── filters (spec §94) ─────────────────────── */}
      <Card title="রিপোর্ট ফিল্টার / Date Filter" bodyClass="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[150px] flex-1">
            <span className="label">From Date</span>
            <input
              type="date"
              className="input h-10"
              value={fromDate}
              min={isoOfDay(month.year, month.month, 1)}
              max={isoOfDay(month.year, month.month, month.totalDays)}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="block min-w-[150px] flex-1">
            <span className="label">To Date</span>
            <input
              type="date"
              className="input h-10"
              value={toDate}
              min={isoOfDay(month.year, month.month, 1)}
              max={isoOfDay(month.year, month.month, month.totalDays)}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              রিপোর্ট দেখুন
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
        <GuideLine section="report" text="তারিখ ফিল্টার ও হিসাবের নিয়ম" />
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
            <Kpi label="স্থায়ী তহবিল" value={`৳ ${formatMoney(summary.totalFund)}`} tone="warn" sub="মিল খরচ থেকে বাদ যায় না" />
            <Kpi label="শেয়ার্ড অতিরিক্ত" value={`৳ ${formatMoney(summary.totalSharedExtra)}`} />
            <Kpi label="ইন্ডিভিজুয়াল অতিরিক্ত" value={`৳ ${formatMoney(summary.totalIndividualExtra)}`} />
            <Kpi label="লাস্ট ব্যালেন্স" value={`৳ ${formatMoney(summary.lastBalance)}`} tone={summary.lastBalance >= 0 ? "ok" : "danger"} />
          </div>

          {/* ── member report table (spec §40) ──────── */}
          <Card
            title="সদস্য হিসাব / Member Report"
            bodyClass="p-0"
          >
            {calcs.length === 0 ? (
              <div className="p-3">
                <EmptyState icon="👥" title="কোনো সদস্য পাওয়া যায়নি" hint="সদস্য যোগ করলে রিপোর্ট তৈরি হবে।" />
              </div>
            ) : (
              <div className="table-wrap" style={{ borderRadius: 0, borderWidth: 0 }}>
                <table className="data" style={{ minWidth: 1180 }}>
                  <thead>
                    <tr>
                      <th>সদস্য / Member</th>
                      <th className="num">মোট মিল</th>
                      <th className="num">মিল রেট</th>
                      <th className="num">মিল খরচ</th>
                      <th className="num">ইন্ডি. অতিরিক্ত</th>
                      <th className="num">শেয়ার্ড অতিরিক্ত</th>
                      <th className="num">মোট খরচ (−)</th>
                      <th className="num">জমা / সমন্বয়</th>
                      <th className="num">নিজের টাকা থেকে বাজার</th>
                      <th className="num">দেনা-পাওনা</th>
                      <th className="num">স্থায়ী ফান্ড</th>
                      <th className="text-center">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcs.map((m) => (
                      <tr key={m.memberId}>
                        <td>
                          <span className="block font-bold">{m.name}</span>
                          <span className="muted block text-[11px]">
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
                          {m.selfPaidBazar > 0 ? `+৳${formatMoney(m.selfPaidBazar)}` : "—"}
                        </td>
                        <td className="num font-extrabold tabular-nums">
                          <span style={{ color: m.denaPoana < 0 ? "var(--danger)" : m.denaPoana > 0 ? "var(--ok)" : "var(--muted)" }}>
                            {m.denaPoana < 0 ? "−" : m.denaPoana > 0 ? "+" : ""}৳{formatMoney(Math.abs(m.denaPoana))}
                          </span>
                        </td>
                        <td className="num tabular-nums text-[var(--brand)]">৳{formatMoney(m.permanentFund)}</td>
                        <td className="text-center">
                          <Badge tone={m.statusEn === "Due" ? "danger" : m.statusEn === "Receive" ? "ok" : "muted"}>
                            {m.status} / {m.statusEn}
                          </Badge>
                        </td>
                      </tr>
                    ))}
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
                      <td className="num tabular-nums">দিবে ৳{formatMoney(totalDue)} • পাবে ৳{formatMoney(totalReceive)}</td>
                      <td className="num tabular-nums">৳{formatMoney(summary.totalFund)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                <p className="muted border-t border-[var(--border)] px-3 py-2 text-[11.5px]">
                  দেনা-পাওনা = জমা/সমন্বয় + নিজের টাকা থেকে বাজার − মোট খরচ • স্থায়ী ফান্ড আলাদা খাত, এই হিসাবে মেশে না
                </p>
              </div>
            )}
          </Card>

          {/* ── bazar + income summary ──────────────── */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="বাজার সামারি / Bazar Summary" bodyClass="p-3">
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

            <Card title="দেনা-পাওনা সারাংশ / Dena-Paona" bodyClass="p-3">
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

          <p className="muted text-[11px]">
            রিপোর্ট তৈরির সময়: {report?.generatedAt ? toDisplayDateTime(report.generatedAt) : "—"} • হিসাবের সূত্র অপরিবর্তনীয়
            (spec §121)।
          </p>
        </>
      )}

      {/* ── CSV modal ─────────────────────────────── */}
      <Modal
        open={csvOpen}
        title="CSV ডাউনলোড / Download CSV"
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

      <ConfirmDialog
        open={closeOpen}
        busy={closeBusy}
        title={month.isClosed ? "মাসটি পুনরায় খুলবেন?" : "মাসটি বন্ধ করবেন?"}
        message={
          month.isClosed
            ? `${month.monthName} মাসটি আবার খোলা হবে — ম্যানেজাররাও তখন এন্ট্রি দিতে/বদলাতে পারবেন।`
            : `${month.monthName} মাসটি বন্ধ করলে ম্যানেজাররা আর কোনো এন্ট্রি যোগ বা পরিবর্তন করতে পারবেন না (শুধু অ্যাডমিন পারবেন)। আগের সব হিসাব দেখা যাবে।`
        }
        confirmLabel={month.isClosed ? "খুলুন" : "বন্ধ করুন"}
        onCancel={() => setCloseOpen(false)}
        onConfirm={() => void toggleClose()}
      />
    </div>
  );
}
