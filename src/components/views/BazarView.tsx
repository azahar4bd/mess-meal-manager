"use client";

import React, { useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { EntryPanel, type ColumnDef, type FieldDef, type FieldExtraCtx, type FormState } from "@/components/ui/entry-panel";
import { BazarItemsModal, linesTotal } from "@/components/BazarItemsModal";
import { formatMoney0, round2, toNumber } from "@/lib/format";
import { isoOfDay, toDisplayDate, toIsoDate, todayIso } from "@/lib/date";
import type { BazarCategory, BazarDTO, BazarLine } from "@/lib/types";

/** তালিকায় নেই এমন পুরনো ক্রেতার নামও ড্রপডাউনে দেখানোর জন্য বিশেষ আইডি-প্রিফিক্স */
const CUSTOM = "__custom:";

export function BazarView() {
  const app = useApp();
  const data = app.data;
  const month = app.month;
  const canWrite = app.can("bazar.write") && !(month?.isClosed && app.role !== "admin");

  /* আইটেম পপআপের ড্রাফট — এন্ট্রি সেভ না করা পর্যন্ত থেকে যায় */
  const [itemsOpen, setItemsOpen] = useState(false);
  const [lines, setLines] = useState<BazarLine[]>([]);
  const setFieldRef = useRef<(key: string, value: string) => void>(() => {});

  const defaultDate = useMemo(() => {
    if (!month) return todayIso();
    const today = todayIso();
    return today.startsWith(`${month.year}-${String(month.month).padStart(2, "0")}`) ? today : isoOfDay(month.year, month.month, 1);
  }, [month]);

  const rows = data?.bazarExpenses ?? [];
  const baseMembers = (data?.members ?? []).map((m) => ({ id: m.id, name: m.name, isActive: m.isActive }));

  const members = useMemo(() => {
    const knownNames = new Set(baseMembers.map((m) => m.name.trim().toLowerCase()));
    const extras = new Map<string, { id: string; name: string; isActive: boolean }>();
    for (const r of rows) {
      const name = (r.buyerName ?? "").trim();
      if (!name || r.memberId || knownNames.has(name.toLowerCase())) continue;
      extras.set(`${CUSTOM}${name}`, { id: `${CUSTOM}${name}`, name, isActive: true });
    }
    return [...baseMembers, ...extras.values()];
  }, [baseMembers, rows]);

  const fields: FieldDef[] = [
    { key: "date", label: "তারিখ / Date", type: "date", required: true, half: true },
    { key: "memberId", label: "ক্রেতা / Buyer", type: "member", required: true, half: true },
    { key: "amount", label: "পরিমাণ / Amount (৳)", type: "money", required: true, placeholder: "500", half: true },
    { key: "items", label: "আইটেম / Items", type: "text", placeholder: "আলু, পেঁয়াজ", half: true },
    { key: "note", label: "নোট / Note", type: "textarea", placeholder: "সকালের বাজার" },
  ];

  const initialValues = (): FormState => ({
    date: toIsoDate(defaultDate),
    memberId: "",
    category: "Groceries",
    amount: "",
    items: "",
    note: "",
  });

  const toForm = (row: BazarDTO): FormState => ({
    date: toIsoDate(row.date),
    memberId: row.memberId || (row.buyerName ? `${CUSTOM}${row.buyerName}` : ""),
    category: row.category ?? "Groceries",
    amount: String(row.amount ?? ""),
    items: row.items ?? "",
    note: row.note ?? "",
  });

  /** এন্ট্রি ফর্ম খুললে আইটেম ড্রাফট লোড/রিসেট হয় */
  const onFormOpen = (editingId: string | null) => {
    const row = editingId ? rows.find((r) => r.id === editingId) : null;
    setLines(row?.lines?.length ? row.lines.map((l) => ({ ...l })) : []);
  };

  const onSubmit = async (values: FormState, editingId: string | null): Promise<boolean> => {
    const rawMember = values.memberId ?? "";
    const isCustom = rawMember.startsWith(CUSTOM);
    const member = members.find((m) => m.id === rawMember);
    const payload = {
      date: toIsoDate(values.date),
      memberId: isCustom ? null : rawMember || null,
      buyerName: (isCustom ? rawMember.slice(CUSTOM.length) : (member?.name ?? "")).trim(),
      category: (values.category || "Groceries") as BazarCategory,
      items: values.items,
      lines,
      amount: round2(toNumber(values.amount)),
      note: values.note,
    };
    if (!payload.buyerName) {
      app.toast("ক্রেতা নির্বাচন করুন", "error");
      return false;
    }
    if (payload.amount <= 0) {
      app.toast("পরিমাণ ০ এর বেশি হতে হবে", "error");
      return false;
    }
    const action = editingId ? "bazar.update" : "bazar.create";
    const res = await app.call<BazarDTO>(action, editingId ? { id: editingId, ...payload } : payload);
    if (!res) return false;
    app.toast(editingId ? "বাজার এন্ট্রি হালনাগাদ হয়েছে ✓" : `বাজার যোগ হয়েছে ✓ ৳ ${formatMoney0(payload.amount)}`, "success");
    setLines([]);
    return true;
  };

  const onDelete = async (row: BazarDTO): Promise<boolean> => {
    const res = await app.call<{ deleted: boolean }>("bazar.delete", { id: row.id });
    if (!res) return false;
    app.toast("বাজার এন্ট্রি মুছে ফেলা হয়েছে", "success");
    return true;
  };

  /** পপআপে সেভ চাপলে মোট টাকা পরিমাণের ঘরে বসে যায় (পরে ম্যানুয়ালি বদলানো যায়) */
  const applyItems = (next: BazarLine[], total: number) => {
    setLines(next.map((l) => ({ ...l })));
    setFieldRef.current("amount", String(round2(total)));
    setItemsOpen(false);
    app.toast(`মোট ৳ ${formatMoney0(total)} পরিমাণের ঘরে বসেছে ✓`, "success");
  };

  const fieldExtra: Record<string, (ctx: FieldExtraCtx) => React.ReactNode> = {
    amount: (ctx) => {
      setFieldRef.current = ctx.setValue;
      const t = linesTotal(lines);
      return (
        <button
          type="button"
          className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--brand-soft)] px-3 py-2 text-left text-[12.5px] font-bold transition hover:brightness-[0.97]"
          style={{ color: "var(--brand)" }}
          onClick={() => setItemsOpen(true)}
          disabled={!canWrite}
          title="আইটেম ধরে ধরে হিসাব করুন"
        >
          <span aria-hidden className="text-[16px]">
            🧾
          </span>
          <span className="min-w-0 flex-1 truncate">
            {lines.length ? `${lines.length}টি আইটেম • ৳ ${formatMoney0(t)}` : "আইটেম পপআপে হিসাব করুন"}
          </span>
          <span className="muted text-[11px]">{lines.length ? "বদলান ↗" : "খুলুন ↗"}</span>
        </button>
      );
    },
  };

  const columns: ColumnDef<BazarDTO>[] = [
    { key: "date", header: "তারিখ / Date", render: (r) => <span className="tabular-nums">{toDisplayDate(r.date)}</span> },
    { key: "buyer", header: "ক্রেতা / Buyer", render: (r) => <span className="font-semibold">{r.buyerName || "—"}</span> },
    {
      key: "items",
      header: "আইটেম / Items",
      render: (r) => (
        <span className="max-w-[260px] truncate" title={r.items || undefined}>
          {r.items || "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "পরিমাণ / Amount",
      align: "right",
      render: (r) => <span className="font-bold tabular-nums">৳ {formatMoney0(r.amount)}</span>,
      footer: (list) => `৳ ${formatMoney0(list.reduce((s, r) => s + toNumber(r.amount), 0))}`,
    },
    { key: "note", header: "নোট / Note", hideOnMobile: true, render: (r) => <span className="muted max-w-[180px] truncate">{r.note || "—"}</span> },
  ];

  const closedNotice = month?.isClosed && app.role !== "admin" ? "🔒 এই মাসটি বন্ধ — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন।" : null;

  return (
    <>
      <EntryPanel<BazarDTO>
        title="বাজার খরচ / Bazar Expense"
        subtitle={`${month?.monthName ?? ""} • মোট বাজার ৳ ${formatMoney0(app.summary?.totalBazarCost ?? 0)} • নেট মিল খরচ ৳ ${formatMoney0(app.summary?.netCost ?? 0)}`}
        fields={fields}
        rows={rows}
        columns={columns}
        canWrite={canWrite}
        closedNotice={closedNotice}
        initialValues={initialValues}
        toForm={toForm}
        onFormOpen={onFormOpen}
        fieldExtra={fieldExtra}
        onSubmit={onSubmit}
        onDelete={canWrite ? onDelete : undefined}
        emptyTitle="এই মাসে কোনো বাজার এন্ট্রি নেই"
        emptyHint="উপরের ফর্ম থেকে প্রথম বাজার খরচটি যোগ করুন।"
        emptyIcon="🧺"
        addLabel="+ নতুন বাজার"
        formTitle="বাজার এন্ট্রি"
        members={members}
        search={(r) => `${r.buyerName} ${r.items} ${r.note} ${toDisplayDate(r.date)}`}
        toolbar={<span className="muted hidden text-[11.5px] sm:block">{rows.length} এন্ট্রি</span>}
      />

      <BazarItemsModal
        open={itemsOpen}
        lines={lines}
        onChange={setLines}
        onClose={() => setItemsOpen(false)}
        onApply={applyItems}
        disabled={!canWrite}
      />
    </>
  );
}
