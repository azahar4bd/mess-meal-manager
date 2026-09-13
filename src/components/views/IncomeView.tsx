"use client";

import React, { useMemo } from "react";
import { useApp } from "@/components/app-context";
import { EntryPanel, type ColumnDef, type FieldDef, type FormState } from "@/components/ui/entry-panel";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { isoOfDay, toDisplayDate, toIsoDate, todayIso } from "@/lib/date";
import type { IncomeDTO } from "@/lib/types";

export function IncomeView() {
  const app = useApp();
  const data = app.data;
  const month = app.month;
  const summary = app.summary;
  const canWrite = app.can("income.write") && !(month?.isClosed && app.role !== "admin");

  const defaultDate = useMemo(() => {
    if (!month) return todayIso();
    const today = todayIso();
    return today.startsWith(`${month.year}-${String(month.month).padStart(2, "0")}`)
      ? today
      : isoOfDay(month.year, month.month, 1);
  }, [month]);

  const rows = data?.otherIncomes ?? [];

  const fields: FieldDef[] = [
    { key: "date", label: "তারিখ / Date", type: "date", required: true, half: true },
    { key: "title", label: "খাত / Title", type: "text", required: true, placeholder: "Guest meal income", half: true },
    { key: "amount", label: "পরিমাণ / Amount (৳)", type: "money", required: true, placeholder: "2000", half: true },
    { key: "note", label: "নোট / Note", type: "textarea", placeholder: "ব্যাংক সুদ / গেস্ট মিল / পুরনো সামগ্রী বিক্রি" },
  ];

  const initialValues = (): FormState => ({ date: toIsoDate(defaultDate), title: "", amount: "", note: "" });

  const toForm = (row: IncomeDTO): FormState => ({
    date: toIsoDate(row.date),
    title: row.title ?? "",
    amount: String(row.amount ?? ""),
    note: row.note ?? "",
  });

  const onSubmit = async (values: FormState, editingId: string | null): Promise<boolean> => {
    const amount = round2(toNumber(values.amount));
    if (amount <= 0) {
      app.toast("পরিমাণ ০ এর বেশি হতে হবে", "error");
      return false;
    }
    if (!values.title.trim()) {
      app.toast("খাতের নাম লিখুন", "error");
      return false;
    }
    const payload = { date: toIsoDate(values.date), title: values.title.trim(), amount, note: values.note };
    const res = await app.call<IncomeDTO>(editingId ? "income.update" : "income.create", editingId ? { id: editingId, ...payload } : payload);
    if (!res) return false;
    app.toast(editingId ? "আয় এন্ট্রি হালনাগাদ হয়েছে ✓" : `আয় যোগ হয়েছে ✓ ৳ ${formatMoney(amount)}`, "success");
    return true;
  };

  const onDelete = async (row: IncomeDTO): Promise<boolean> => {
    const res = await app.call<{ deleted: boolean }>("income.delete", { id: row.id });
    if (!res) return false;
    app.toast("আয় এন্ট্রি মুছে ফেলা হয়েছে", "success");
    return true;
  };

  const columns: ColumnDef<IncomeDTO>[] = [
    { key: "date", header: "তারিখ / Date", render: (r) => <span className="tabular-nums">{toDisplayDate(r.date)}</span> },
    { key: "title", header: "খাত / Title", render: (r) => <span className="font-semibold">{r.title || "—"}</span> },
    {
      key: "amount",
      header: "পরিমাণ / Amount",
      align: "right",
      render: (r) => <span className="font-bold tabular-nums text-[var(--ok)]">৳ {formatMoney(r.amount)}</span>,
      footer: (list) => `৳ ${formatMoney(list.reduce((s, r) => s + toNumber(r.amount), 0))}`,
    },
    { key: "note", header: "নোট / Note", hideOnMobile: true, render: (r) => <span className="muted max-w-[220px] truncate">{r.note || "—"}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--ok)] bg-[var(--ok-soft)] px-3 py-2.5 text-[12.5px] font-semibold text-[var(--ok)]">
        ➕ অন্যান্য আয় সরাসরি মিল খরচ কমায়: <strong>নেট মিল খরচ = মোট বাজার − অন্যান্য আয়</strong> = ৳{" "}
        {formatMoney(summary?.totalBazarCost ?? 0)} − ৳ {formatMoney(summary?.totalOthersIncome ?? 0)} = ৳{" "}
        {formatMoney(summary?.netCost ?? 0)}
      </div>

      <EntryPanel<IncomeDTO>
        title="অন্যান্য আয় / Other Income"
        subtitle={`${month?.monthName ?? ""} • মোট আয় ৳ ${formatMoney(summary?.totalOthersIncome ?? 0)}`}
        fields={fields}
        rows={rows}
        columns={columns}
        canWrite={canWrite}
        closedNotice={month?.isClosed && app.role !== "admin" ? "🔒 এই মাসটি বন্ধ — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন।" : null}
        initialValues={initialValues}
        toForm={toForm}
        onSubmit={onSubmit}
        onDelete={canWrite ? onDelete : undefined}
        emptyTitle="কোনো অন্যান্য আয় এন্ট্রি নেই"
        emptyHint="গেস্ট মিল, সুদ, বা পুরনো সামগ্রী বিক্রির আয় এখানে যোগ করুন।"
        emptyIcon="➕"
        addLabel="+ নতুন আয়"
        formTitle="অন্যান্য আয়"
        search={(r) => `${r.title} ${r.note} ${toDisplayDate(r.date)}`}
      />
    </div>
  );
}
