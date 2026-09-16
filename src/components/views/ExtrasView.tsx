"use client";

import React, { useMemo } from "react";
import { useApp } from "@/components/app-context";
import { EntryPanel, type ColumnDef, type FieldDef, type FormState } from "@/components/ui/entry-panel";
import { Badge, Card, Kpi } from "@/components/ui";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { isoOfDay, toDisplayDate, toIsoDate, todayIso } from "@/lib/date";
import type { ExtraDTO, ExtraType } from "@/lib/types";

export function ExtrasView() {
  const app = useApp();
  const data = app.data;
  const month = app.month;
  const summary = app.summary;
  const canWrite = app.can("extras.write") && !(month?.isClosed && app.role !== "admin");

  const defaultDate = useMemo(() => {
    if (!month) return todayIso();
    const today = todayIso();
    return today.startsWith(`${month.year}-${String(month.month).padStart(2, "0")}`)
      ? today
      : isoOfDay(month.year, month.month, 1);
  }, [month]);

  const rows = data?.extraExpenses ?? [];
  const members = (data?.members ?? []).map((m) => ({ id: m.id, name: m.name, isActive: m.isActive }));
  const activeCount = summary?.activeMembers ?? 0;
  const sharedPerMember = activeCount > 0 ? round2((summary?.totalSharedExtra ?? 0) / activeCount) : 0;
  // নিজ-পকেটে দেওয়া অতিরিক্ত খরচ — “নিজ টাকার বাজার” ঘরে জমা হয়
  const selfPaidExtras = useMemo(
    () => round2((data?.extraExpenses ?? []).filter((r) => r.paidByMemberId).reduce((s, r) => s + toNumber(r.amount), 0)),
    [data],
  );

  const fields: FieldDef[] = [
    { key: "date", label: "তারিখ / Date", type: "date", required: true, half: true },
    {
      key: "type",
      label: "ধরন / Type",
      type: "select",
      required: true,
      half: true,
      options: [
        { value: "shared", label: "Shared — সব সক্রিয় সদস্যের মধ্যে ভাগ হবে" },
        { value: "individual", label: "Individual — নির্দিষ্ট সদস্যের উপর যাবে" },
      ],
    },
    { key: "title", label: "খাত / Title", type: "text", placeholder: "Gas bill / Repair", half: true },
    { key: "amount", label: "পরিমাণ / Amount (৳)", type: "money", required: true, placeholder: "1000", half: true },
    {
      key: "memberId",
      label: "কার জন্য (শুধু Individual) / For member",
      type: "member",
      half: true,
      hint: "Shared নির্বাচন করলে সদস্য লাগবে না",
    },
    {
      key: "paidByMemberId",
      label: "টাকা প্রদানকারী (নিজ টাকা) / Paid by",
      type: "member",
      half: true,
      hint: "কেউ নিজ পকেট থেকে দিলে তার নাম দিন — “নিজ টাকার বাজার” ঘরে জমা হবে",
    },
    { key: "note", label: "নোট / Note", type: "textarea" },
  ];

  const initialValues = (): FormState => ({
    date: toIsoDate(defaultDate),
    type: "shared",
    title: "",
    amount: "",
    memberId: "",
    paidByMemberId: "",
    note: "",
  });

  const toForm = (row: ExtraDTO): FormState => ({
    date: toIsoDate(row.date),
    type: row.type,
    title: row.title ?? "",
    amount: String(row.amount ?? ""),
    memberId: row.memberId ?? "",
    paidByMemberId: row.paidByMemberId ?? "",
    note: row.note ?? "",
  });

  const onSubmit = async (values: FormState, editingId: string | null): Promise<boolean> => {
    const amount = round2(toNumber(values.amount));
    const type = (values.type === "individual" ? "individual" : "shared") as ExtraType;
    if (amount <= 0) {
      app.toast("পরিমাণ ০ এর বেশি হতে হবে", "error");
      return false;
    }
    if (type === "individual" && !values.memberId) {
      app.toast("Individual খরচের জন্য সদস্য নির্বাচন করুন", "error");
      return false;
    }
    const payload = {
      date: toIsoDate(values.date),
      title: values.title.trim(),
      amount,
      type,
      memberId: type === "individual" ? values.memberId : null,
      paidByMemberId: values.paidByMemberId || null,
      note: values.note,
    };
    const res = await app.call<ExtraDTO>(editingId ? "extra.update" : "extra.create", editingId ? { id: editingId, ...payload } : payload);
    if (!res) return false;
    app.toast(editingId ? "অতিরিক্ত খরচ হালনাগাদ হয়েছে ✓" : `অতিরিক্ত খরচ যোগ হয়েছে ✓ ৳ ${formatMoney(amount)}`, "success");
    return true;
  };

  const onDelete = async (row: ExtraDTO): Promise<boolean> => {
    const res = await app.call<{ deleted: boolean }>("extra.delete", { id: row.id });
    if (!res) return false;
    app.toast("অতিরিক্ত খরচ মুছে ফেলা হয়েছে", "success");
    return true;
  };

  const columns: ColumnDef<ExtraDTO>[] = [
    { key: "date", header: "তারিখ / Date", render: (r) => <span className="tabular-nums">{toDisplayDate(r.date)}</span> },
    { key: "title", header: "খাত / Title", render: (r) => <span className="font-semibold">{r.title || "—"}</span> },
    {
      key: "type",
      header: "ধরন / Type",
      align: "center",
      render: (r) => <Badge tone={r.type === "shared" ? "brand" : "warn"}>{r.type === "shared" ? "Shared" : "Individual"}</Badge>,
    },
    { key: "member", header: "কার জন্য / For", render: (r) => r.memberName || (r.type === "shared" ? "সবাই" : "—") },
    {
      key: "paidBy",
      header: "টাকা প্রদানকারী / Paid by",
      render: (r) => {
        if (!r.paidByMemberId) return <span className="muted">ফান্ড</span>;
        const payer = data?.members.find((m) => m.id === r.paidByMemberId)?.name ?? r.paidByMemberId;
        return (
          <span className="inline-flex items-center gap-1">
            <span className="pill pill-warn">নিজ টাকা</span>
            <span className="font-semibold">{payer}</span>
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "পরিমাণ / Amount",
      align: "right",
      render: (r) => <span className="font-bold tabular-nums">৳ {formatMoney(r.amount)}</span>,
      footer: (list) => `৳ ${formatMoney(list.reduce((s, r) => s + toNumber(r.amount), 0))}`,
    },
    { key: "note", header: "নোট / Note", hideOnMobile: true, render: (r) => <span className="muted max-w-[180px] truncate">{r.note || "—"}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="মোট শেয়ার্ড" value={`৳ ${formatMoney(summary?.totalSharedExtra ?? 0)}`} tone="brand" />
        <Kpi label="জনপ্রতি শেয়ার্ড" value={`৳ ${formatMoney(sharedPerMember)}`} />
        <Kpi label="মোট ইন্ডি." value={`৳ ${formatMoney(summary?.totalIndividualExtra ?? 0)}`} tone="warn" />
        <Kpi label="মোট অতিরিক্ত" value={`৳ ${formatMoney(round2((summary?.totalSharedExtra ?? 0) + (summary?.totalIndividualExtra ?? 0)))}`} />
        <Kpi label="নিজ টাকায় পরিশোধ" value={`৳ ${formatMoney(selfPaidExtras)}`} tone="brand" />
      </div>

      <EntryPanel<ExtraDTO>
        title="অতিরিক্ত খরচ"
        subtitle={`${month?.monthName ?? ""} • shared/individual — নিজ টাকায় দিলে “টাকা প্রদানকারী” ঘরে নাম দিন`}
        fields={fields}
        rows={rows}
        columns={columns}
        canWrite={canWrite}
        closedNotice={month?.isClosed && app.role !== "admin" ? "🔒 এই মাসটি বন্ধ — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন।" : null}
        initialValues={initialValues}
        toForm={toForm}
        onSubmit={onSubmit}
        onDelete={canWrite ? onDelete : undefined}
        emptyTitle="কোনো অতিরিক্ত খরচ নেই"
        emptyHint="গ্যাস বিল, মেরামত, ইন্টারনেট ইত্যাদি খরচ এখানে যোগ করুন।"
        emptyIcon="🧾"
        addLabel="+ নতুন অতিরিক্ত খরচ"
        formTitle="অতিরিক্ত খরচ"
        members={members}
        search={(r) => {
          const payer = data?.members.find((m) => m.id === r.paidByMemberId)?.name ?? "";
          return `${r.title} ${r.memberName} ${payer} ${r.type} ${r.note}`;
        }}
      />
    </div>
  );
}
