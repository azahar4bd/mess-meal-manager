"use client";

import React, { useMemo } from "react";
import { useApp } from "@/components/app-context";
import { EntryPanel, type ColumnDef, type FieldDef, type FormState } from "@/components/ui/entry-panel";
import { Badge, Card } from "@/components/ui";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { isoOfDay, toDisplayDate, toIsoDate, todayIso } from "@/lib/date";
import type { DepositDTO } from "@/lib/types";

export function FundView() {
  const app = useApp();
  const data = app.data;
  const month = app.month;
  const summary = app.summary;
  const canWrite = app.can("fund.write") && !(month?.isClosed && app.role !== "admin");

  const defaultDate = useMemo(() => {
    if (!month) return todayIso();
    const today = todayIso();
    return today.startsWith(`${month.year}-${String(month.month).padStart(2, "0")}`)
      ? today
      : isoOfDay(month.year, month.month, 1);
  }, [month]);

  const rows = data?.deposits ?? [];
  const members = (data?.members ?? []).map((m) => ({ id: m.id, name: m.name, isActive: m.isActive }));

  // সদস্যভিত্তিক স্থায়ী ফান্ড — শুধু permanent_fund সারি (ক্লোজ-ক্যারি কপিসহ);
  // সাধারণ জমা/মাস-শেষ/জের-পরিশোধ/সমন্বয় এখানে কখনো মেশে না → মূল টাকা কখনো ০ হয় না
  const perMemberFund = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.type !== "permanent_fund") continue;
      const key = r.memberId ?? `name:${(r.memberName || "").toLowerCase()}`;
      map.set(key, round2((map.get(key) ?? 0) + toNumber(r.amount)));
    }
    return map;
  }, [rows]);

  const fields: FieldDef[] = [
    { key: "date", label: "তারিখ / Date", type: "date", required: true, half: true },
    { key: "memberId", label: "সদস্য / Member", type: "member", required: true, half: true },
    { key: "amount", label: "পরিমাণ / Amount (৳)", type: "money", required: true, placeholder: "2000", half: true },
    {
      key: "type",
      label: "ধরন / Type",
      type: "select",
      half: true,
      options: [
        { value: "member_deposit", label: "সদস্যের জমা / মাসিক পরিশোধ" },
        { value: "closing_payment", label: "মাস-শেষ পরিশোধ / Closing Payment" },
        { value: "jer_payment", label: "জের পরিশোধ / Due Payment" },
        { value: "adjustment", label: "সমন্বয় / adjustment" },
        { value: "permanent_fund", label: "স্থায়ী তহবিল / permanent_fund" },
        { value: "refund", label: "ফেরত / refund" },
      ],
    },
    { key: "note", label: "নোট / Note", type: "textarea", placeholder: "Permanent capital deposit" },
  ];

  const initialValues = (): FormState => ({
    date: toIsoDate(defaultDate),
    memberId: "",
    amount: "",
    type: "member_deposit",
    note: "",
  });

  const toForm = (row: DepositDTO): FormState => ({
    date: toIsoDate(row.date),
    memberId: row.memberId ?? "",
    memberName: row.memberName ?? "",
    amount: String(row.amount ?? ""),
    type: row.type || "permanent_fund",
    note: row.note ?? "",
  });

  const onSubmit = async (values: FormState, editingId: string | null): Promise<boolean> => {
    const amount = round2(toNumber(values.amount));
    if (!values.memberId) {
      app.toast("সদস্য নির্বাচন করুন", "error");
      return false;
    }
    if (amount <= 0) {
      app.toast("পরিমাণ ০ এর বেশি হতে হবে", "error");
      return false;
    }
    if (editingId) {
      const existing = rows.find((r) => r.id === editingId);
      if ((existing?.createdBy ?? "") === "system:carry-forward") {
        app.toast("ক্যারি-ফরোয়ার্ড হওয়া ফান্ড/সমন্বয় এডিট করা যায় না (সিস্টেম-তৈরি)", "error");
        return false;
      }
    }
    const payload = {
      date: toIsoDate(values.date),
      memberId: values.memberId,
      amount,
      note: values.note,
      type: values.type || "permanent_fund",
    };
    const res = await app.call<DepositDTO>(editingId ? "deposit.update" : "deposit.create", editingId ? { id: editingId, ...payload } : payload);
    if (!res) return false;
    app.toast(editingId ? "জমা এন্ট্রি হালনাগাদ হয়েছে ✓" : `জমা যোগ হয়েছে ✓ ৳ ${formatMoney(amount)}`, "success");
    return true;
  };

  const onDelete = async (row: DepositDTO): Promise<boolean> => {
    if ((row.createdBy ?? "") === "system:carry-forward") {
      app.toast("ক্যারি-ফরোয়ার্ড হওয়া ফান্ড/সমন্বয় মোছা যায় না (সিস্টেম-তৈরি)", "error");
      return false;
    }
    const res = await app.call<{ deleted: boolean }>("deposit.delete", { id: row.id });
    if (!res) return false;
    app.toast("জমা এন্ট্রি মুছে ফেলা হয়েছে", "success");
    return true;
  };

  const columns: ColumnDef<DepositDTO>[] = [
    { key: "date", header: "তারিখ / Date", render: (r) => <span className="tabular-nums">{toDisplayDate(r.date)}</span> },
    { key: "member", header: "সদস্য / Member", render: (r) => <span className="font-semibold">{r.memberName || "—"}</span> },
    {
      key: "amount",
      header: "পরিমাণ / Amount",
      align: "right",
      render: (r) => {
        const v = r.type === "refund" ? -Math.abs(toNumber(r.amount)) : toNumber(r.amount);
        return (
          <span
            className={`font-bold tabular-nums ${v < 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}
          >
            {v < 0 ? "−" : ""}৳ {formatMoney(Math.abs(v))}
          </span>
        );
      },
      footer: (list) =>
        `৳ ${formatMoney(
          list.reduce((s, r) => s + (r.type === "refund" ? -Math.abs(toNumber(r.amount)) : toNumber(r.amount)), 0),
        )}`,
    },
    {
      key: "type",
      header: "ধরন / Type",
      align: "center",
      render: (r) => (
        <Badge
          tone={
            (r.createdBy ?? "") === "system:carry-forward"
              ? "muted"
              : r.type === "permanent_fund"
              ? "brand"
              : r.type === "refund" || r.type === "jer_payment"
                ? "warn"
                : r.type === "closing_payment"
                  ? "ok"
                  : "muted"
          }
        >
          {(r.createdBy ?? "") === "system:carry-forward"
            ? "ক্যারি-ফরোয়ার্ড"
            : r.type === "permanent_fund"
            ? "স্থায়ী তহবিল"
            : r.type === "member_deposit"
              ? "সদস্যের জমা"
              : r.type === "closing_payment"
                ? "মাস-শেষ পরিশোধ"
                : r.type === "jer_payment"
                  ? "জের পরিশোধ"
                  : r.type === "adjustment"
                    ? "সমন্বয়"
                    : r.type === "refund"
                      ? "ফেরত"
                      : r.type}
        </Badge>
      ),
    },
    { key: "note", header: "নোট / Note", hideOnMobile: true, render: (r) => <span className="muted max-w-[200px] truncate">{r.note || "—"}</span> },
  ];

  const closedNotice = month?.isClosed && app.role !== "admin" ? "🔒 এই মাসটি বন্ধ — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন।" : null;

  return (
    <div className="space-y-3">
      

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card bodyClass="p-3">
          <div className="kpi-k">মোট স্থায়ী তহবিল</div>
          <div className="kpi-v text-[var(--brand)]">৳ {formatMoney(summary?.totalFund ?? 0)}</div>
        </Card>
        <Card bodyClass="p-3">
          <div className="kpi-k">এই মাসে নগদ আদায়</div>
          <div className="kpi-v">৳ {formatMoney(summary?.totalCashCollected ?? 0)}</div>
        </Card>
        <Card bodyClass="p-3">
          <div className="kpi-k">জের নগদ সমন্বয়</div>
          <div className="kpi-v text-[var(--ok)]">৳ {formatMoney(summary?.totalJerCashPaid ?? 0)}</div>
        </Card>
        <Card bodyClass="p-3">
          <div className="kpi-k">হাতে নগদ</div>
          <div className="kpi-v">৳ {formatMoney(summary?.cashBalance ?? 0)}</div>
        </Card>
        <Card bodyClass="p-3">
          <div className="kpi-k">লাস্ট ব্যালেন্স</div>
          <div className="kpi-v" style={{ color: (summary?.lastBalance ?? 0) >= 0 ? "var(--ok)" : "var(--danger)" }}>
            ৳ {formatMoney(summary?.lastBalance ?? 0)}
          </div>
        </Card>
      </div>

      <EntryPanel<DepositDTO>
        title="জমা ও তহবিল"
        subtitle={`${month?.monthName ?? ""} • সদস্যের জমা ও স্থায়ী তহবিল (আলাদা খাত)`}
        fields={fields}
        rows={rows}
        columns={columns}
        canWrite={canWrite}
        closedNotice={closedNotice}
        initialValues={initialValues}
        toForm={toForm}
        onSubmit={onSubmit}
        onDelete={canWrite ? onDelete : undefined}
        emptyTitle="কোনো জমা এন্ট্রি নেই"
        emptyHint="সদস্যের জমা, সমন্বয় বা স্থায়ী তহবিল এখানে যোগ করুন।"
        emptyIcon="💰"
        addLabel="+ নতুন জমা"
        formTitle="জমা এন্ট্রি"
        members={members}
        search={(r) => `${r.memberName} ${r.note} ${r.type} ${toDisplayDate(r.date)}`}
      />

      {rows.length > 0 ? (
        <Card title="সদস্য অনুযায়ী স্থায়ী ফান্ড (মাস ক্লোজে কপি হয়, কখনো ০ হয় না)" bodyClass="p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {(data?.members ?? []).map((m) => {
              const amount = perMemberFund.get(m.id) ?? perMemberFund.get(`name:${m.name.toLowerCase()}`) ?? 0;
              return (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
                  <span className="min-w-0 truncate text-[12.5px] font-semibold">{m.name}</span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-[var(--brand)]">৳ {formatMoney(amount)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
