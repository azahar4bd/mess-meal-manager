"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { GuideLine } from "@/components/GuideLine";
import { Badge, Card, ConfirmDialog, EmptyState, Field, Kpi, Loader, Modal, Select, TextArea, TextInput } from "@/components/ui";
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
 *  দেনা-পাওনা জমা ম্যানেজার (মোডাল) — সদস্যের প্রতিটি জমা রেকর্ড
 *  তালিকায় দেখা যায়; নতুন জমা যোগ, যেকোনোটির Edit/Delete চলে।
 *  জমা দেনা কমায় ও লাস্ট ব্যালেন্স (নগদ) বাড়ায়; বাজার/মিল রেট ছোঁয় না।
 * ══════════════════════════════════════════════════════════ */

function PaymentManagerModal({
  open,
  onClose,
  month,
  member,
  items,
  canWrite,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  month: MonthDTO;
  member: MemberCalculation;
  items: DepositDTO[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const app = useApp();
  const lastDay = isoOfDay(month.year, month.month, month.totalDays);
  const defaultNote = `দেনা-পাওনার জমা (${month.monthName})`;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(lastDay);
  const [amount, setAmount] = useState("");
  const [payType, setPayType] = useState("closing_payment");
  const [note, setNote] = useState(defaultNote);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<DepositDTO | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEditingId(null);
      setDate(lastDay);
      setAmount("");
      setPayType("closing_payment");
      setNote(defaultNote);
      setDeleting(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month.id, member.memberId]);

  const startEdit = (d: DepositDTO) => {
    setEditingId(d.id);
    setDate(d.date || lastDay);
    setAmount(String(d.amount));
    setPayType(d.type || "closing_payment");
    setNote(d.note || defaultNote);
  };

  const resetForm = () => {
    setEditingId(null);
    setDate(lastDay);
    setAmount("");
    setPayType("closing_payment");
    setNote(defaultNote);
  };

  const typeLabel = (t: string) =>
    t === "jer_payment"
      ? "জের পরিশোধ"
      : t === "member_deposit"
        ? "সাধারণ জমা"
        : t === "closing_payment"
          ? "মাস-শেষ পরিশোধ"
          : t === "adjustment"
            ? "সমন্বয়"
            : t === "refund"
              ? "ফেরত"
              : t;

  const save = async () => {
    const value = round2(Number(amount.trim()) || 0);
    if (!Number.isFinite(value) || value <= 0) {
      app.toast("সঠিক পরিমাণ লিখুন (০ এর চেয়ে বেশি)", "error");
      return;
    }
    if (!date) {
      app.toast("তারিখ নির্বাচন করুন", "error");
      return;
    }
    setBusy(true);
    const res = editingId
      ? await app.call("deposit.update", {
          id: editingId,
          memberId: member.memberId,
          memberName: member.name,
          amount: value,
          date,
          type: payType,
          note: note.trim() || defaultNote,
        })
      : await app.call("deposit.create", {
          monthId: month.id,
          memberId: member.memberId,
          memberName: member.name,
          amount: value,
          date,
          type: payType,
          note: note.trim() || defaultNote,
        });
    setBusy(false);
    if (!res) return;
    app.toast(`${member.name} — জমা ${editingId ? "হালনাগাদ" : "সংরক্ষিত"} হয়েছে ✓`, "success");
    resetForm();
    onChanged();
  };

  const runDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const ok = await app.call("deposit.delete", { id: deleting.id });
    setDeleteBusy(false);
    if (!ok) return;
    if (editingId === deleting.id) resetForm();
    setDeleting(null);
    app.toast("জমা রেকর্ড মুছে ফেলা হয়েছে", "success");
    onChanged();
  };

  const totalPaid = round2(items.reduce((s, d) => s + Number(d.amount), 0));

  return (
    <Modal
      open={open}
      title={`দেনা-পাওনা জমা — ${member.name}`}
      subtitle={`${month.monthName} • মোট জমা ৳${formatMoney(totalPaid)}`}
      onClose={onClose}
    >
      {canWrite ? (
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--brand-soft)]/40 p-3">
          <div className="mb-2 text-[12.5px] font-bold">{editingId ? "জমা হালনাগাদ করুন" : "নতুন জমা যোগ করুন"}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="তারিখ" required>
              <TextInput
                type="date"
                value={date}
                min={isoOfDay(month.year, month.month, 1)}
                max={lastDay}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="জমার ধরন" required>
              <Select value={payType} onChange={(e) => setPayType(e.target.value)}>
                <option value="closing_payment">মাস-শেষ পরিশোধ (দেনা-পাওনা)</option>
                <option value="member_deposit">সাধারণ জমা</option>
                <option value="jer_payment">জের পরিশোধ (পুরনো বাকি)</option>
              </Select>
            </Field>
            <Field label="পরিমাণ (৳)" required>
              <TextInput
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>
          <Field label="নোট" className="mt-2">
            <TextArea value={note} rows={2} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            {editingId ? (
              <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={busy}>
                বাতিল করে নতুন
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "Save Changes" : "জমা সংরক্ষণ"}
            </button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState icon="💸" title="এখনো কোনো জমা নেই" hint={canWrite ? "উপরে পরিমাণ লিখে প্রথম জমা সংরক্ষণ করুন।" : undefined} />
      ) : (
        <div className="table-wrap" style={{ borderWidth: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>তারিখ</th>
                <th>ধরন</th>
                <th className="num">পরিমাণ</th>
                <th>নোট</th>
                {canWrite ? <th className="text-center">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {items
                .slice()
                .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
                .map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap tabular-nums">{toDisplayDate(d.date)}</td>
                    <td>
                      <Badge tone={d.type === "jer_payment" ? "warn" : "brand"}>{typeLabel(d.type)}</Badge>
                    </td>
                    <td className="num font-bold tabular-nums text-[var(--ok)]">৳{formatMoney(d.amount)}</td>
                    <td className="muted text-[12px]">{d.note || "—"}</td>
                    {canWrite ? (
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(d)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-[var(--danger)]"
                            onClick={() => setDeleting(d)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>মোট জমা</td>
                <td className="num font-extrabold tabular-nums text-[var(--ok)]">৳{formatMoney(totalPaid)}</td>
                <td />
                {canWrite ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        busy={deleteBusy}
        message={`${toDisplayDate(deleting?.date ?? "")} তারিখের ৳${formatMoney(deleting?.amount ?? 0)} জমা মুছে ফেলা হবে — দেনা ও লাস্ট ব্যালেন্স আবার আগের অবস্থায় ফিরে যাবে।`}
        confirmLabel="মুছে ফেলুন"
        onCancel={() => setDeleting(null)}
        onConfirm={() => void runDelete()}
      />
    </Modal>
  );
}

export function ReportView() {
  const app = useApp();
  const month = app.month;

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rangeWarn, setRangeWarn] = useState("");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvOpen, setCsvOpen] = useState(false);
  const [selfOnly, setSelfOnly] = useState(false);
  const [payMember, setPayMember] = useState<MemberCalculation | null>(null);
  const [confirmClear, setConfirmClear] = useState<MemberCalculation | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const reqId = useRef(0);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((x) => x + 1), []);

  // অন্য মাসের রেসপন্স যেন এই মাসে ভুলে রেন্ডার না হয় (ব্লিংকিং দূর করতে)
  const currentReport = report && month && report.month?.id === month.id ? report : null;
  const summary = currentReport?.summary ?? (app.month?.id === month?.id ? app.summary : null);
  const data = currentReport?.data ?? (app.month?.id === month?.id ? app.data : null);

  const firstDay = month ? isoOfDay(month.year, month.month, 1) : "";
  const lastDayIso = month ? isoOfDay(month.year, month.month, month.totalDays) : "";

  // মাস বদলালে ফিল্টার পুরো মাসে রিসেট — বাছামাত্র নিচের ইফেক্ট রিপোর্ট আনে।
  const monthRef = useRef<string | undefined>(month?.id);
  useEffect(() => {
    if (!month) return;
    setFromDate(isoOfDay(month.year, month.month, 1));
    setToDate(isoOfDay(month.year, month.month, month.totalDays));
    setRangeWarn("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month?.id]);

  // তারিখ বাছামাত্র স্বয়ংক্রিয়ভাবে রিপোর্ট লোড (কোনো OK/দেখুন বাটন নেই)
  useEffect(() => {
    if (!month || !fromDate || !toDate) return;
    const fromYM = fromDate.slice(0, 7);
    const toYM = toDate.slice(0, 7);
    const curYM = isoOfDay(month.year, month.month, 1).slice(0, 7);

    // মাস এইমাত্র বদলেছে — তারিখ রিসেট-ইফেক্ট নতুন মান বসালে এই ইফেক্ট
    // আবার চলবে; এই পাসে পুরোনো মাসের তারিখ নিয়ে কিছু করা যাবে না।
    if (monthRef.current !== month.id) {
      monthRef.current = month.id;
      return;
    }
    if (fromYM !== toYM) {
      setRangeWarn("শুরু ও শেষ তারিখ একই মাসের হতে হবে — এক মাসের রিপোর্ট দেখানো হয়।");
      setLoading(false);
      return;
    }
    if (fromYM !== curYM) {
      // ইচ্ছাকৃতভাবে অন্য মাসের তারিখ টাইপ/বাছা হয়েছে — সেই মাস খোলা থাকলে সুইচ
      const target = app.months.find((x) => isoOfDay(x.year, x.month, 1).slice(0, 7) === fromYM);
      if (target && target.id !== month.id) {
        void app.selectMonth(target.id);
        return;
      }
      setLoading(false);
      setRangeWarn("এই তারিখের মাস এখনো খোলা হয়নি — উপরের মাস সিলেক্টর থেকে মাস বেছে নিন।");
      return;
    }
    if (fromDate < firstDay || toDate > lastDayIso) {
      setLoading(false);
      setRangeWarn("তারিখ নির্বাচিত মাসের ভেতরে হতে হবে।");
      return;
    }
    setRangeWarn("");

    const myReq = ++reqId.current;
    setLoading(true);
    mess<ReportResponse>("report.summary", { monthId: month.id, fromDate, toDate })
      .then((res) => {
        if (myReq !== reqId.current) return;
        setReport(res);
        setSelfOnly(Boolean(res?.selfOnly));
      })
      .catch((err) => {
        if (myReq !== reqId.current) return;
        app.toast(err instanceof Error ? err.message : "রিপোর্ট লোড করা যায়নি", "error");
      })
      .finally(() => {
        if (myReq === reqId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month?.id, fromDate, toDate, reloadTick]);

  const resetFullMonth = () => {
    setRangeWarn("");
    setFromDate(firstDay);
    setToDate(lastDayIso);
  };

  const categories = useMemo(() => (data ? bazarByCategory(data.bazarExpenses) : {}), [data]);
  const buyers = useMemo(() => (data ? bazarByBuyer(data.bazarExpenses) : {}), [data]);

  // সদস্যভিত্তিক নগদ জমা — স্থায়ী ফান্ড বাদ; সিস্টেম ক্যারি-ফরোয়ার্ড সমন্বয়
  // (নগদ নয়, গত মাসের পাওনা) আলাদা রাখা হয়। jer_payment-ও নগদ জমা।
  const paymentMap = useMemo(() => {
    const map: Record<string, { cash: number; carry: number; items: DepositDTO[] }> = {};
    for (const d of data?.deposits ?? []) {
      if (!d.memberId) continue;
      if (d.type === "permanent_fund") continue;
      const entry = (map[d.memberId] ??= { cash: 0, carry: 0, items: [] });
      if ((d.createdBy ?? "") === "system:carry-forward") {
        entry.carry = round2(entry.carry + Number(d.amount));
        continue;
      }
      entry.cash = round2(entry.cash + Number(d.amount));
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
  // দেনা-পাওনা জমা টেবিল: প্রতি সদস্যের জমা-পূর্ব দেনা, নগদ জমা ও বাকি
  const cashOf = (m: MemberCalculation) =>
    round2(m.totalDeposit - (paymentMap[m.memberId]?.carry ?? 0) + (m.jerCashPaid ?? 0));
  const payRows = calcs
    .map((m) => {
      const paid = cashOf(m);
      const dueBefore = round2(m.denaPoana - paid);
      return { m, paid, dueBefore };
    })
    .filter((r) => r.dueBefore < -0.005 || r.paid > 0.005);
  const totalClosing = round2(payRows.reduce((s, r) => s + r.paid, 0));
  const payTotalDue = round2(payRows.filter((r) => r.dueBefore < -0.005).reduce((s, r) => s + Math.abs(r.dueBefore), 0));
  const payTotalRemainingDue = round2(payRows.filter((r) => r.m.denaPoana < -0.005).reduce((s, r) => s + Math.abs(r.m.denaPoana), 0));
  const payTotalRemainingReceive = round2(payRows.filter((r) => r.m.denaPoana > 0.005).reduce((s, r) => s + r.m.denaPoana, 0));

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
          <label className="block min-w-[150px] flex-1">
            <span className="label">শুরু</span>
            <input type="date" className="input h-9" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="block min-w-[150px] flex-1">
            <span className="label">শেষ</span>
            <input type="date" className="input h-9" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ghost h-9" onClick={resetFullMonth}>
            পুরো মাস
          </button>
        </div>
        <p className="muted mt-1.5 text-[11px]">তারিখ ঘরে ট্যাপ করলেই নেটিভ ক্যালেন্ডার খোলে — তারিখ বাছামাত্র রিপোর্ট নিজে থেকেই হালনাগাদ হয়।</p>
        {rangeWarn ? (
          <div className="mt-1.5 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--warn)]">
            {rangeWarn}
          </div>
        ) : null}
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
            <Kpi label="নগদ আদায় (জমা)" value={`৳ ${formatMoney(summary.totalCashCollected)}`} tone="brand" />
            <Kpi label="বাকি জের (সদস্য-দেনা)" value={`৳ ${formatMoney(summary.totalRemainingJer ?? 0)}`} tone="warn" />
            <Kpi label="লাস্ট ব্যালেন্স (হাত-নগদ)" value={`৳ ${formatMoney(summary.lastBalance)}`} tone={summary.lastBalance >= 0 ? "ok" : "danger"} />
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
                <table className="data report-table" style={{ minWidth: hasJer ? 820 : 600 }}>
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
                      <th className="num vth" title="জমা-সমন্বয়সহ চূড়ান্ত হিসাব; বিস্তারিত নিচের “দেনা-পাওনা জমা” টেবিলে">
                        দেনা(−)/<br/>পাওনা(+)
                      </th>
                      <th className="num vth">স্থায়ী<br/>ফান্ড</th>
                      <th className="vth text-center">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcs.map((m) => {
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
                        <td className="num tabular-nums">
                          {/* ধনাত্মক = জমা/ফের (সবুজ); ঋণাত্মক = গত মাসের বাকির সমন্বয়-এন্ট্রি (লাল) */}
                          <SignedMoney value={m.totalDeposit} />
                        </td>
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

          {/* ── দেনা-পাওনা জমা টেবিল (সদস্য হিসেবের ঠিক নিচে) ── */}
          {fullMonth ? (
            <Card
              title="💸 দেনা-পাওনা জমা"
              action={
                <span className="muted text-[11px] font-semibold">
                  জমা দিলে দেনা কমে ও লাস্ট ব্যালেন্স বাড়ে; বাজার/মিল রেট অপরিবর্তিত থাকে
                </span>
              }
              bodyClass="p-0"
            >
              {payRows.length === 0 ? (
                <div className="p-3">
                  <EmptyState icon="✅" title="কারো কোনো দেনা-পাওনা নেই" hint="মিল খরচ বা জমা বসলে এই তালিকায় সদস্য ও জমার হিসাব দেখা যাবে।" />
                </div>
              ) : (
                <div className="table-wrap" style={{ borderRadius: 0, borderWidth: 0 }}>
                  <table className="data" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>সদস্য</th>
                        <th className="num vth">মোট দেনা</th>
                        <th className="num vth">মোট জমা</th>
                        <th className="num vth">বাকি দেনা(−)/পাওনা(+)</th>
                        {canWriteFund ? <th className="text-center">Action</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {payRows.map(({ m, paid, dueBefore }) => {
                        const items = paymentMap[m.memberId]?.items ?? [];
                        return (
                          <tr key={m.memberId}>
                            <td>
                              <span className="block font-bold">{m.name}</span>
                              <span className="cell-sub muted block text-[10.5px]">
                                {m.role}
                                {m.phone ? ` • ${m.phone}` : ""}
                              </span>
                            </td>
                            <td className="num tabular-nums text-[var(--danger)]">
                              {dueBefore < -0.005 ? `৳${formatMoney(Math.abs(dueBefore))}` : "—"}
                            </td>
                            <td className="num tabular-nums text-[var(--ok)]">
                              {paid > 0.005 ? `৳${formatMoney(paid)}` : "—"}
                            </td>
                            <td className="num tabular-nums" style={{ background: "var(--brand-soft)" }}>
                              <SignedMoney value={m.denaPoana} bold />
                            </td>
                            {canWriteFund ? (
                              <td className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPayMember(m)}>
                                    {paid > 0.005 ? "Edit" : "+ জমা"}
                                  </button>
                                  {paid > 0.005 ? (
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm text-[var(--danger)]"
                                      onClick={() => setConfirmClear(m)}
                                    >
                                      Delete
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>মোট</td>
                        <td className="num font-bold tabular-nums text-[var(--danger)]">৳{formatMoney(payTotalDue)}</td>
                        <td className="num font-bold tabular-nums text-[var(--ok)]">৳{formatMoney(totalClosing)}</td>
                        <td className="num font-extrabold tabular-nums" style={{ background: "var(--brand-soft)" }}>
                          দিবে ৳{formatMoney(payTotalRemainingDue)}
                          <br />
                          পাবে ৳{formatMoney(payTotalRemainingReceive)}
                        </td>
                        {canWriteFund ? <td /> : null}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] text-[var(--muted)]">
              💸 দেনা-পাওনা জমা টেবিল শুধু পুরো মাসের রিপোর্টে দেখানো হয় — “পুরো মাস” বাটনে চাপুন।
            </div>
          )}

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

      {/* ── দেনা-পাওনা জমা ম্যানেজার ───────────────── */}
      {payMember && month ? (
        <PaymentManagerModal
          open
          onClose={() => setPayMember(null)}
          month={month}
          member={payMember}
          items={paymentMap[payMember.memberId]?.items ?? []}
          canWrite={canWriteFund}
          onChanged={reload}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmClear}
        busy={clearBusy}
        message={`${confirmClear?.name ?? ""} — এর দেনা-পাওনার সব জমা (৳${formatMoney(
          confirmClear ? cashOf(confirmClear) : 0,
        )}) মুছে ফেলা হবে; দেনা ও লাস্ট ব্যালেন্স আগের অবস্থায় ফিরে যাবে।`}
        confirmLabel="সব জমা মুছুন"
        onCancel={() => setConfirmClear(null)}
        onConfirm={async () => {
          if (!confirmClear) return;
          const items = paymentMap[confirmClear.memberId]?.items ?? [];
          setClearBusy(true);
          let ok = true;
          for (const d of items) {
            const r = await app.call("deposit.delete", { id: d.id });
            if (!r) ok = false;
          }
          setClearBusy(false);
          if (ok) {
            app.toast(`${confirmClear.name} — সব জমা মুছে ফেলা হয়েছে`, "success");
            setConfirmClear(null);
            reload();
          }
        }}
      />

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
