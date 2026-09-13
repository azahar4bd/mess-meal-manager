"use client";

import React, { useMemo } from "react";
import { useApp } from "@/components/app-context";
import { EntryPanel, type ColumnDef, type FieldDef, type FormState } from "@/components/ui/entry-panel";
import { Badge } from "@/components/ui";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { isoOfDay, toDisplayDate, toIsoDate, todayIso } from "@/lib/date";
import { BAZAR_CATEGORY_BN, type BazarCategory, type BazarDTO } from "@/lib/types";

export function BazarView() {
  const app = useApp();
  const data = app.data;
  const month = app.month;
  const canWrite = app.can("bazar.write") && !(month?.isClosed && app.role !== "admin");

  const defaultDate = useMemo(() => {
    if (!month) return todayIso();
    const today = todayIso();
    return today.startsWith(`${month.year}-${String(month.month).padStart(2, "0")}`)
      ? today
      : isoOfDay(month.year, month.month, 1);
  }, [month]);

  const rows = data?.bazarExpenses ?? [];
  const members = (data?.members ?? []).map((m) => ({ id: m.id, name: m.name, isActive: m.isActive }));

  const fields: FieldDef[] = [
    { key: "date", label: "তারিখ / Date", type: "date", required: true, half: true },
    { key: "memberId", label: "ক্রেতা / Buyer", type: "member", half: true, hint: "তালিকায় না থাকলে নিচে নাম লিখুন" },
    { key: "buyerName", label: "ক্রেতার নাম (নির্বাচন না করলে)", type: "text", placeholder: "Azahar", half: true },
    {
      key: "category",
      label: "ক্যাটাগরি / Category",
      type: "select",
      options: (Object.keys(BAZAR_CATEGORY_BN) as BazarCategory[]).map((c) => ({ value: c, label: `${BAZAR_CATEGORY_BN[c]} / ${c}` })),
      half: true,
    },
    { key: "amount", label: "পরিমাণ / Amount (৳)", type: "money", required: true, placeholder: "500", half: true },
    { key: "items", label: "আইটেম / Items", type: "text", placeholder: "Potato, Onion", half: true },
    { key: "note", label: "নোট / Note", type: "textarea", placeholder: "Morning market" },
  ];

  const initialValues = (): FormState => ({
    date: toIsoDate(defaultDate),
    memberId: "",
    buyerName: "",
    category: "Vegetables",
    amount: "",
    items: "",
    note: "",
  });

  const toForm = (row: BazarDTO): FormState => ({
    date: toIsoDate(row.date),
    memberId: row.memberId ?? "",
    buyerName: row.buyerName ?? "",
    category: row.category ?? "Groceries",
    amount: String(row.amount ?? ""),
    items: row.items ?? "",
    note: row.note ?? "",
  });

  const onSubmit = async (values: FormState, editingId: string | null): Promise<boolean> => {
    const member = members.find((m) => m.id === values.memberId);
    const payload = {
      date: toIsoDate(values.date),
      memberId: values.memberId || null,
      buyerName: (values.buyerName || member?.name || "").trim(),
      category: (values.category || "Groceries") as BazarCategory,
      items: values.items,
      amount: round2(toNumber(values.amount)),
      note: values.note,
    };
    if (!payload.buyerName) {
      app.toast("ক্রেতার নাম বা সদস্য নির্বাচন করুন", "error");
      return false;
    }
    if (payload.amount <= 0) {
      app.toast("পরিমাণ ০ এর বেশি হতে হবে", "error");
      return false;
    }
    const action = editingId ? "bazar.update" : "bazar.create";
    const res = await app.call<BazarDTO>(action, editingId ? { id: editingId, ...payload } : payload);
    if (!res) return false;
    app.toast(editingId ? "বাজার এন্ট্রি হালনাগাদ হয়েছে ✓" : `বাজার যোগ হয়েছে ✓ ৳ ${formatMoney(payload.amount)}`, "success");
    return true;
  };

  const onDelete = async (row: BazarDTO): Promise<boolean> => {
    const res = await app.call<{ deleted: boolean }>("bazar.delete", { id: row.id });
    if (!res) return false;
    app.toast("বাজার এন্ট্রি মুছে ফেলা হয়েছে", "success");
    return true;
  };

  const columns: ColumnDef<BazarDTO>[] = [
    { key: "date", header: "তারিখ / Date", render: (r) => <span className="tabular-nums">{toDisplayDate(r.date)}</span> },
    { key: "buyer", header: "ক্রেতা / Buyer", render: (r) => <span className="font-semibold">{r.buyerName || "—"}</span> },
    {
      key: "category",
      header: "ক্যাটাগরি",
      render: (r) => <Badge tone="brand">{BAZAR_CATEGORY_BN[r.category] ?? r.category}</Badge>,
    },
    { key: "items", header: "আইটেম / Items", render: (r) => <span className="max-w-[220px] truncate">{r.items || "—"}</span> },
    {
      key: "amount",
      header: "পরিমাণ / Amount",
      align: "right",
      render: (r) => <span className="font-bold tabular-nums">৳ {formatMoney(r.amount)}</span>,
      footer: (list) => `৳ ${formatMoney(list.reduce((s, r) => s + toNumber(r.amount), 0))}`,
    },
    { key: "note", header: "নোট / Note", hideOnMobile: true, render: (r) => <span className="muted max-w-[180px] truncate">{r.note || "—"}</span> },
  ];

  const closedNotice = month?.isClosed && app.role !== "admin" ? "🔒 এই মাসটি বন্ধ — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন।" : null;

  return (
    <EntryPanel<BazarDTO>
      title="বাজার খরচ / Bazar Expense"
      subtitle={`${month?.monthName ?? ""} • মোট বাজার ৳ ${formatMoney(app.summary?.totalBazarCost ?? 0)} • নেট মিল খরচ ৳ ${formatMoney(app.summary?.netCost ?? 0)}`}
      fields={fields}
      rows={rows}
      columns={columns}
      canWrite={canWrite}
      closedNotice={closedNotice}
      initialValues={initialValues}
      toForm={toForm}
      onSubmit={onSubmit}
      onDelete={canWrite ? onDelete : undefined}
      emptyTitle="এই মাসে কোনো বাজার এন্ট্রি নেই"
      emptyHint="উপরের ফর্ম থেকে প্রথম বাজার খরচটি যোগ করুন।"
      emptyIcon="🧺"
      addLabel="+ নতুন বাজার"
      formTitle="বাজার এন্ট্রি"
      members={members}
      search={(r) => `${r.buyerName} ${r.items} ${r.category} ${r.note} ${toDisplayDate(r.date)}`}
      toolbar={<span className="muted hidden text-[11.5px] sm:block">{rows.length} এন্ট্রি</span>}
    />
  );
}
