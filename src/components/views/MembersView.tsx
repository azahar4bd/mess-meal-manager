"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { GuideLine } from "@/components/GuideLine";
import { EntryPanel, type ColumnDef, type FieldDef, type FormState } from "@/components/ui/entry-panel";
import { Badge, Card, ConfirmDialog, EmptyState, Loader, Modal, StatusPill } from "@/components/ui";
import { mess, ApiError } from "@/lib/client";
import { formatMeal, formatMoney0 } from "@/lib/format";
import { toDisplayDateTime as fmtDt } from "@/lib/date";
import type { MemberDTO } from "@/lib/types";

interface PendingUser {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  officeId: string | null;
  createdAt: string;
}

const MEMBER_ROLES = [
  { value: "member", label: "সদস্য / Member" },
  { value: "manager", label: "ম্যানেজার / Manager" },
  { value: "audit", label: "অডিট / Audit" },
  { value: "guest", label: "গেস্ট / Guest" },
];

export function MembersView() {
  const app = useApp();
  const data = app.data;
  const month = app.month;
  const summary = app.summary;
  const canWrite = app.can("members.write") && !(month?.isClosed && app.role !== "admin");

  const [showPending, setShowPending] = useState(false);
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [decision, setDecision] = useState<{ user: PendingUser; status: "approved" | "rejected" | "inactive" } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [copyOpen, setCopyOpen] = useState(false);

  const rows = data?.members ?? [];
  const calcs = summary?.memberCalculations ?? [];
  const calcById = new Map(calcs.map((c) => [c.memberId, c]));

  /* ── সদস্যের নিজের পছন্দমতো ক্রম — মিল এন্ট্রি/মাস গ্রিডেও হুবহু এটাই দেখায় ── */
  const [order, setOrder] = useState<MemberDTO[]>(rows);
  const [orderDirty, setOrderDirty] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!orderDirty) setOrder(rows);
  }, [rows, orderDirty]);

  const moveMember = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    setOrder(next);
    setOrderDirty(true);
  };

  const dropMember = (index: number) => {
    if (!dragId) return;
    const from = order.findIndex((m) => m.id === dragId);
    setDragId(null);
    if (from < 0 || from === index) return;
    const next = [...order];
    const [row] = next.splice(from, 1);
    next.splice(index, 0, row!);
    setOrder(next);
    setOrderDirty(true);
  };

  const saveOrder = async () => {
    setOrderBusy(true);
    const res = await app.call<{ saved: number }>("members.reorder", { ids: order.map((m) => m.id) });
    setOrderBusy(false);
    if (res) {
      setOrderDirty(false);
      app.toast("সদস্যের ক্রম সংরক্ষিত হয়েছে ✓", "success");
    }
  };

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await mess<PendingUser[]>("admin.pendingUsers");
      setPending(Array.isArray(res) ? res : []);
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "forbidden") {
        app.toast(err instanceof Error ? err.message : "অনুমোদন তালিকা লোড করা যায়নি", "error");
      }
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  }, [app]);

  useEffect(() => {
    if (showPending) void loadPending();
  }, [showPending, loadPending]);

  const fields: FieldDef[] = [
    { key: "name", label: "সদস্যের নাম / Name", type: "text", required: true, placeholder: "Azahar", half: true },
    { key: "phone", label: "মোবাইল / Phone", type: "text", placeholder: "01722222222", half: true },
    {
      key: "role",
      label: "ভূমিকা / Role",
      type: "select",
      options: MEMBER_ROLES,
      half: true,
    },
    {
      key: "isActive",
      label: "স্ট্যাটাস / Status",
      type: "select",
      half: true,
      options: [
        { value: "true", label: "সক্রিয় / Active" },
        { value: "false", label: "নিষ্ক্রিয় / Inactive" },
      ],
    },
    { key: "note", label: "নোট / Note", type: "textarea" },
  ];

  const initialValues = (): FormState => ({ name: "", phone: "", role: "member", isActive: "true", note: "" });

  const toForm = (row: MemberDTO): FormState => ({
    name: row.name,
    phone: row.phone ?? "",
    role: row.role || "member",
    isActive: row.isActive ? "true" : "false",
    note: row.note ?? "",
  });

  const onSubmit = async (values: FormState, editingId: string | null): Promise<boolean> => {
    if (values.name.trim().length < 2) {
      app.toast("সদস্যের নাম কমপক্ষে ২ অক্ষরের হতে হবে", "error");
      return false;
    }
    const payload = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      role: values.role || "member",
      isActive: values.isActive !== "false",
      note: values.note,
    };
    const res = await app.call<MemberDTO>(editingId ? "member.update" : "member.create", editingId ? { id: editingId, ...payload } : payload);
    if (!res) return false;
    app.toast(editingId ? `সদস্য হালনাগাদ হয়েছে ✓ ${res.name}` : `নতুন সদস্য যোগ হয়েছে ✓ ${res.name}`, "success");
    return true;
  };

  const onDelete = async (row: MemberDTO): Promise<boolean> => {
    const res = await app.call<{ deleted: boolean }>("member.delete", { id: row.id });
    if (!res) return false;
    app.toast(`${row.name} কে মুছে ফেলা হয়েছে`, "success");
    return true;
  };

  const toggleActive = async (row: MemberDTO) => {
    const res = await app.call<MemberDTO>("member.update", { id: row.id, isActive: !row.isActive });
    if (res) app.toast(`${row.name} → ${res.isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}`, "success");
  };

  const decide = async () => {
    if (!decision) return;
    setDecisionBusy(true);
    try {
      await mess("admin.user.status", { id: decision.user.id, status: decision.status });
      app.toast(
        decision.status === "approved"
          ? `${decision.user.name} অনুমোদিত হয়েছে ✓`
          : `${decision.user.name} → ${decision.status}`,
        "success",
      );
      setDecision(null);
      await loadPending();
      await app.refresh();
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "কাজটি সম্পন্ন করা যায়নি", "error");
    } finally {
      setDecisionBusy(false);
    }
  };

  const doCopy = async () => {
    if (!copyFrom) {
      app.toast("উৎস মাস নির্বাচন করুন", "error");
      return;
    }
    const res = await app.call<{ copied: number }>("month.copyRoster", { fromMonthId: copyFrom });
    setCopyOpen(false);
    if (res) app.toast(`${res.copied} জন সদস্য কপি হয়েছে ✓`, "success");
  };

  const columns: ColumnDef<MemberDTO>[] = [
    {
      key: "name",
      header: "সদস্য / Member",
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[11px] font-bold text-[var(--brand)]">
            {r.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="block font-bold">{r.name}</span>
            <span className="muted block text-[11px]">{r.phone || "কোনো মোবাইল নেই"}</span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "ভূমিকা / Role",
      align: "center",
      render: (r) => <Badge tone={r.role === "manager" ? "brand" : "muted"}>{r.role}</Badge>,
    },
    {
      key: "status",
      header: "স্ট্যাটাস",
      align: "center",
      render: (r) => <Badge tone={r.isActive ? "ok" : "danger"}>{r.isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}</Badge>,
    },
    { key: "meals", header: "মিল / Meals", align: "right", render: (r) => <span className="tabular-nums">{formatMeal(calcById.get(r.id)?.totalMill ?? 0)}</span> },
    {
      key: "cost",
      header: "মোট খরচ / Cost",
      align: "right",
      render: (r) => <span className="font-bold tabular-nums">৳ {formatMoney0(calcById.get(r.id)?.totalCost ?? 0)}</span>,
      footer: (list) => `৳ ${formatMoney0(list.reduce((s, r) => s + (calcById.get(r.id)?.totalCost ?? 0), 0))}`,
    },
    {
      key: "fund",
      header: "স্থায়ী ফান্ড / Fund",
      align: "right",
      hideOnMobile: true,
      render: (r) => <span className="tabular-nums text-[var(--brand)]">৳ {formatMoney0(calcById.get(r.id)?.permanentFund ?? 0)}</span>,
    },
    {
      key: "dena",
      header: "দেনা-পাওনা",
      align: "center",
      render: (r) => {
        const c = calcById.get(r.id);
        if (!c) return "—";
        return <Badge tone={c.statusEn === "Due" ? "danger" : c.statusEn === "Receive" ? "ok" : "muted"}>{c.status}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-3">
      {app.can("user.manage") || app.can("members.approve") ? (
        <Card
          title="যোগদানের অনুমোদন / Member Approval"
          bodyClass="p-3"
        >
          {!showPending ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setShowPending(true)}>
              অনুমোদনের তালিকা দেখুন
            </button>
          ) : pendingLoading ? (
            <Loader label="Loading pending members…" />
          ) : pending.length === 0 ? (
            <EmptyState icon="✅" title="কোনো অপেক্ষমাণ অনুরোধ নেই" hint="নতুন সদস্য Join করলে এখানে দেখা যাবে।" />
          ) : (
            <div className="space-y-2">
              {pending.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/40 px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{u.name}</span>
                    <span className="muted block truncate text-[11px]">
                      {u.userId} • {u.phone || "—"} • {fmtDt(u.createdAt)}
                    </span>
                  </span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setDecision({ user: u, status: "approved" })}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDecision({ user: u, status: "rejected" })}>
                    Reject
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {canWrite && rows.length > 1 ? (
        <Card
          title="সদস্যের ক্রম / Custom Order"
          subtitle="টেনে অথবা ↑↓ দিয়ে সাজান — মিল এন্ট্রি পেজেও একই ক্রম থাকবে"
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!orderDirty || orderBusy}
                onClick={() => {
                  setOrder(rows);
                  setOrderDirty(false);
                }}
              >
                পূর্বাবস্থা
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!orderDirty || orderBusy} onClick={() => void saveOrder()}>
                {orderBusy ? "সংরক্ষণ হচ্ছে…" : "💾 ক্রম সংরক্ষণ"}
              </button>
            </div>
          }
        >
          <div className="space-y-1.5">
            {order.map((m, i) => (
              <div
                key={m.id}
                draggable
                onDragStart={() => setDragId(m.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropMember(i)}
                className={`flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 transition ${
                  dragId === m.id ? "opacity-40" : "opacity-100"
                } ${m.isActive ? "" : "opacity-70"}`}
                style={{ background: "var(--card)" }}
              >
                <span className="muted w-5 text-center text-[12px] font-bold tabular-nums">{i + 1}</span>
                <span aria-hidden className="muted cursor-grab select-none text-[15px]">
                  ⠿
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{m.name}</span>
                <span className="muted hidden text-[11px] tabular-nums sm:block">{formatMeal(calcById.get(m.id)?.totalMill ?? 0)} মিল</span>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn btn-ghost btn-sm h-8 w-8 px-0" disabled={i === 0} onClick={() => moveMember(i, -1)} aria-label="উপরে তুলুন">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm h-8 w-8 px-0"
                    disabled={i === order.length - 1}
                    onClick={() => moveMember(i, 1)}
                    aria-label="নিচে নামান"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <EntryPanel<MemberDTO>
        title="সদস্য ব্যবস্থাপনা / Member Management"
        subtitle={`${month?.monthName ?? ""} • ${rows.length} জন সদস্য • ${summary?.activeMembers ?? 0} জন সক্রিয়`}
        fields={fields}
        rows={rows}
        columns={columns}
        canWrite={canWrite}
        closedNotice={month?.isClosed && app.role !== "admin" ? "🔒 এই মাসটি বন্ধ — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন।" : null}
        initialValues={initialValues}
        toForm={toForm}
        onSubmit={onSubmit}
        onDelete={canWrite ? onDelete : undefined}
        emptyTitle="কোনো সদস্য পাওয়া যায়নি"
        emptyHint="নতুন সদস্য যোগ করুন"
        emptyIcon="👥"
        addLabel="+ নতুন সদস্য"
        formTitle="সদস্য"
        search={(r) => `${r.name} ${r.phone} ${r.role}`}
        toolbar={
          canWrite && app.months.length > 1 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCopyOpen(true)}>
              ⧉ আগের মাস থেকে কপি
            </button>
          ) : null
        }
      />

      {canWrite && rows.length > 0 ? (
        <Card title="দ্রুত কাজ / Quick Actions" bodyClass="p-3">
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <button key={r.id} type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleActive(r)}>
                {r.name} → {r.isActive ? "নিষ্ক্রিয়" : "সক্রিয়"}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Modal
        open={copyOpen}
        title="আগের মাস থেকে সদস্য কপি করুন"
        subtitle="শুধু তালিকা কপি হবে, মিল ০ থেকে শুরু"
        onClose={() => setCopyOpen(false)}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setCopyOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void doCopy()}>
              কপি করুন
            </button>
          </div>
        }
      >
        <label className="block">
          <span className="label">উৎস মাস / Source Month</span>
          <select className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">— নির্বাচন করুন —</option>
            {app.months
              .filter((m) => m.id !== month?.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.monthName}
                </option>
              ))}
          </select>
        </label>
      </Modal>

      <ConfirmDialog
        open={!!decision}
        busy={decisionBusy}
        title={decision?.status === "approved" ? "সদস্য অনুমোদন করবেন?" : "অনুরোধ বাতিল করবেন?"}
        message={
          decision
            ? `${decision.user.name} (${decision.user.userId}) — অনুমোদন দিলে এই মাসের সদস্য তালিকায় যুক্ত হবে এবং রিপোর্ট দেখতে পাবে।`
            : ""
        }
        confirmLabel={decision?.status === "approved" ? "Approve" : "Reject"}
        onCancel={() => setDecision(null)}
        onConfirm={() => void decide()}
      />

      <GuideLine section="members" text="unique নিয়ম, জয়েন অনুমোদন ও কপি" />
    </div>
  );
}
