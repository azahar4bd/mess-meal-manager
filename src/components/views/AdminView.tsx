"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import {
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Kpi,
  Loader,
  Modal,
  SegmentedButtons,
  Select,
  StatusPill,
  TextArea,
  TextInput,
} from "@/components/ui";
import { mess } from "@/lib/client";
import { toDisplayDateTime } from "@/lib/date";
import { ROLE_LABEL } from "@/lib/permissions";
import type { AuditLogDTO, OfficeDTO, Role } from "@/lib/types";

type AdminTab = "overview" | "offices" | "users" | "audit";

interface OfficeRow extends OfficeDTO {
  monthCount: number;
  managerNames: string;
  userCount: number;
}

interface UserRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  branch: string;
  officeId: string | null;
  officeName: string;
  role: Role;
  status: string;
  lastLogin: string | null;
  createdAt: string;
  passwordHashed: boolean;
  passwordPlain?: string;
}

interface AdminSummary {
  offices: number;
  activeOffices: number;
  inactiveOffices: number;
  users: number;
  managers: number;
  members: number;
  pendingUsers: number;
  months: number;
  lastSyncs: { id: string; at: string; officeId: string; ok: boolean; message: string }[];
  officeList: { id: string; name: string; branch: string; code: string; status: string }[];
}

export function AdminView() {
  const app = useApp();
  const [tab, setTab] = useState<AdminTab>("overview");

  if (!app.can("user.manage") && !app.can("office.manage")) {
    return <EmptyState icon="🛡" title="অ্যাডমিন প্যানেলে প্রবেশাধিকার নেই" hint="শুধু প্ল্যাটফর্ম অ্যাডমিন ও ম্যানেজার এই প্যানেল ব্যবহার করতে পারবেন।" />;
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[19px] font-extrabold leading-tight">অ্যাডমিন প্যানেল / Admin Panel</h1>
        <p className="muted text-[12.5px]">অফিস, ইউজার, রোল ও অডিট ট্রেইল ব্যবস্থাপনা</p>
      </div>

      <SegmentedButtons<AdminTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "ওভারভিউ" },
          { value: "offices", label: "অফিস ম্যানেজমেন্ট" },
          { value: "users", label: "ইউজার ম্যানেজমেন্ট" },
          { value: "audit", label: "অডিট ট্রেইল" },
        ]}
      />

      {tab === "overview" ? <OverviewPanel /> : null}
      {tab === "offices" ? <OfficesPanel /> : null}
      {tab === "users" ? <UsersPanel /> : null}
      {tab === "audit" ? <AuditPanel /> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Overview
 * ══════════════════════════════════════════════════════════ */

function OverviewPanel() {
  const app = useApp();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mess<AdminSummary>("admin.summary");
      setSummary(res);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "ওভারভিউ লোড করা যায়নি", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loader label="Loading platform overview…" />;
  if (!summary) return <EmptyState title="ওভারভিউ পাওয়া যায়নি" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="মোট অফিস" value={String(summary.offices)} sub={`${summary.activeOffices} সক্রিয় • ${summary.inactiveOffices} নিষ্ক্রিয়`} tone="brand" />
        <Kpi label="মোট ইউজার" value={String(summary.users)} sub={`${summary.managers} ম্যানেজার • ${summary.members} সদস্য`} />
        <Kpi label="অনুমোদন বাকি" value={String(summary.pendingUsers)} tone={summary.pendingUsers ? "warn" : "ok"} />
        <Kpi label="মোট মাস (সব অফিস)" value={String(summary.months)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="সব অফিস / All Offices" bodyClass="p-3">
          <div className="space-y-1.5">
            {summary.officeList.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold">{o.name}</span>
                  <span className="muted block truncate text-[11px]">
                    {o.branch || "—"} • {o.code} • <code>{o.id}</code>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusPill status={o.status} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void app.switchOffice(o.id)}>
                    Open
                  </button>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="সাম্প্রতিক সিংক / Recent Syncs" bodyClass="p-3">
          {summary.lastSyncs.length === 0 ? (
            <EmptyState icon="☁" title="এখনো কোনো সিংক হয়নি" />
          ) : (
            <div className="space-y-1.5">
              {summary.lastSyncs.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12px]">
                  <Badge tone={s.ok ? "ok" : "danger"}>{s.ok ? "✓" : "✗"}</Badge>
                  <span className="min-w-0 flex-1 truncate">{s.message}</span>
                  <span className="muted shrink-0 text-[11px]">{toDisplayDateTime(s.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Office management (spec §83–§84)
 * ══════════════════════════════════════════════════════════ */

const emptyOfficeForm = {
  id: "",
  name: "",
  branch: "",
  code: "",
  address: "",
  managerName: "",
  managerEmail: "",
  managerPhone: "",
  status: "active",
  sheetUrl: "",
  scriptUrl: "",
  note: "",
};

function OfficesPanel() {
  const app = useApp();
  const [rows, setRows] = useState<OfficeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyOfficeForm });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<OfficeRow | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canManage = app.can("office.manage");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mess<OfficeRow[]>("admin.offices.list");
      setRows(Array.isArray(res) ? res : []);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "অফিস তালিকা লোড করা যায়নি", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyOfficeForm });
    setFormOpen(true);
  };

  const openEdit = (o: OfficeRow) => {
    setEditing(o.id);
    setForm({
      id: o.id,
      name: o.name,
      branch: o.branch,
      code: o.code,
      address: o.address,
      managerName: o.managerName,
      managerEmail: o.managerEmail,
      managerPhone: o.managerPhone,
      status: o.status,
      sheetUrl: o.sheetUrl,
      scriptUrl: o.scriptUrl,
      note: o.note,
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (form.name.trim().length < 2) {
      app.toast("অফিসের নাম লিখুন", "error");
      return;
    }
    setBusy(true);
    const action = editing ? "admin.office.update" : "admin.office.create";
    const res = await app.call<OfficeDTO>(action, editing ? { ...form, id: editing } : form);
    setBusy(false);
    if (res) {
      app.toast(editing ? "অফিস হালনাগাদ হয়েছে ✓" : `নতুন অফিস তৈরি হয়েছে ✓ কোড: ${res.code}`, "success");
      setFormOpen(false);
      await load();
    }
  };

  const setStatus = async (o: OfficeRow, status: "active" | "inactive") => {
    const res = await app.call<OfficeDTO>("admin.office.status", { id: o.id, status });
    if (res) {
      app.toast(`${o.name} → ${status === "active" ? "সক্রিয়" : "নিষ্ক্রিয়"}`, "success");
      await load();
    }
  };

  const runDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const res = await app.call<{ deleted: boolean }>("admin.office.delete", { id: deleting.id, confirm: deleteText });
    setDeleteBusy(false);
    if (res?.deleted) {
      app.toast(`অফিস "${deleting.name}" মুছে ফেলা হয়েছে`, "success");
      setDeleting(null);
      setDeleteText("");
      await load();
    }
  };

  const set = (k: keyof typeof emptyOfficeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="muted text-[12.5px]">
          প্রতিটি অফিস সম্পূর্ণ আলাদা টেন্যান্ট — আলাদা ম্যানেজার, সদস্য, মাস, মিল, বাজার, তহবিল ও রিপোর্ট।
        </p>
        {canManage ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            + নতুন অফিস
          </button>
        ) : null}
      </div>

      {loading ? (
        <Loader label="Loading offices…" />
      ) : rows.length === 0 ? (
        <EmptyState icon="🏢" title="কোনো অফিস পাওয়া যায়নি" hint="নতুন অফিস তৈরি করুন।" />
      ) : (
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>অফিস / Office</th>
                <th>কোড</th>
                <th>ম্যানেজার</th>
                <th>ম্যানেজার ফোন</th>
                <th className="text-center">ইউজার</th>
                <th className="text-center">মাস</th>
                <th className="text-center">স্ট্যাটাস</th>
                <th>Google Sheet</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className="block font-bold">{o.name}</span>
                    <span className="muted block text-[11px]">
                      {o.branch || "—"} • <code>{o.id}</code>
                    </span>
                  </td>
                  <td>
                    <Badge tone="brand">{o.code}</Badge>
                  </td>
                  <td>
                    <span className="block">{o.managerName || "—"}</span>
                    <span className="muted block text-[11px]">{o.managerEmail || ""}</span>
                  </td>
                  <td className="tabular-nums">{o.managerPhone || "—"}</td>
                  <td className="text-center tabular-nums">{o.userCount}</td>
                  <td className="text-center tabular-nums">{o.monthCount}</td>
                  <td className="text-center">
                    <StatusPill status={o.status} />
                  </td>
                  <td>
                    {o.sheetUrl ? (
                      <a className="link text-[12px]" href={o.sheetUrl} target="_blank" rel="noreferrer">
                        শিট ↗
                      </a>
                    ) : (
                      <span className="muted text-[11.5px]">—</span>
                    )}
                    {o.scriptUrl ? <span className="muted block text-[10.5px]">script ✓</span> : null}
                  </td>
                  <td className="text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void app.switchOffice(o.id)}>
                        Open
                      </button>
                      {canManage ? (
                        <>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(o)}>
                            Edit
                          </button>
                          {o.status === "active" ? (
                            <button type="button" className="btn btn-ghost btn-sm text-[var(--warn)]" onClick={() => void setStatus(o, "inactive")}>
                              Deactivate
                            </button>
                          ) : (
                            <button type="button" className="btn btn-ghost btn-sm text-[var(--ok)]" onClick={() => void setStatus(o, "active")}>
                              Activate
                            </button>
                          )}
                          {app.role === "admin" ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-[var(--danger)]"
                              onClick={() => {
                                setDeleting(o);
                                setDeleteText("");
                              }}
                            >
                              Delete
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? "অফিস সম্পাদনা / Edit Office" : "নতুন অফিস / New Office"}
        subtitle={editing ? undefined : "অফিস কোড খালি রাখলে স্বয়ংক্রিয়ভাবে তৈরি হবে"}
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {busy ? "সংরক্ষণ হচ্ছে…" : "Save"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="অফিসের নাম" required>
            <TextInput value={form.name} onChange={set("name")} placeholder="Gobra Mess" />
          </Field>
          <Field label="ব্রাঞ্চ / Branch">
            <TextInput value={form.branch} onChange={set("branch")} placeholder="Barishal" />
          </Field>
          <Field label="অফিস কোড" hint={editing ? undefined : "খালি রাখলে স্বয়ংক্রিয় তৈরি হবে (যেমন GOBRA01)"}>
            <TextInput value={form.code} onChange={set("code")} className="uppercase" placeholder="GOBRA01" />
          </Field>
          <Field label="স্ট্যাটাস">
            <Select value={form.status} onChange={set("status")}>
              <option value="active">active — সক্রিয়</option>
              <option value="pending">pending — অপেক্ষমাণ</option>
              <option value="approved">approved — অনুমোদিত</option>
              <option value="inactive">inactive — নিষ্ক্রিয় (লগইন বন্ধ)</option>
            </Select>
          </Field>
          <Field label="ম্যানেজারের নাম">
            <TextInput value={form.managerName} onChange={set("managerName")} />
          </Field>
          <Field label="ম্যানেজার ফোন">
            <TextInput value={form.managerPhone} onChange={set("managerPhone")} inputMode="tel" />
          </Field>
          <Field label="ম্যানেজার ইমেইল">
            <TextInput value={form.managerEmail} onChange={set("managerEmail")} type="email" />
          </Field>
          <Field label="ঠিকানা">
            <TextInput value={form.address} onChange={set("address")} />
          </Field>
          <Field label="Google Sheet URL">
            <TextInput value={form.sheetUrl} onChange={set("sheetUrl")} placeholder="https://docs.google.com/spreadsheets/d/…" />
          </Field>
          <Field label="Apps Script URL (এই অফিসের জন্য আলাদা)">
            <TextInput value={form.scriptUrl} onChange={set("scriptUrl")} placeholder="https://script.google.com/macros/s/…/exec" />
          </Field>
          <Field label="নোট" className="sm:col-span-2">
            <TextArea value={form.note} onChange={set("note")} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        title="অফিস মুছে ফেলবেন?"
        subtitle="এই অফিসের সব ইউজার, মাস, মিল, বাজার, তহবিল ও রিপোর্ট স্থায়ীভাবে মুছে যাবে।"
        onClose={() => setDeleting(null)}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void runDelete()} disabled={deleteBusy}>
              {deleteBusy ? "মুছে ফেলা হচ্ছে…" : "Delete permanently"}
            </button>
          </div>
        }
      >
        <p className="text-[13px]">
          নিশ্চিত করতে অফিসের নাম বা কোড হুবহু লিখুন: <strong>{deleting?.name}</strong> / <strong>{deleting?.code}</strong>
        </p>
        <TextInput className="mt-2" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder={deleting?.name ?? ""} />
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  User management (spec §81–§82)
 * ══════════════════════════════════════════════════════════ */

const emptyUserForm = {
  id: "",
  userId: "",
  name: "",
  email: "",
  phone: "",
  branch: "",
  officeId: "",
  role: "member" as Role,
  status: "active",
  password: "",
};

function UsersPanel() {
  const app = useApp();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [filterOffice, setFilterOffice] = useState<string>("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ ...emptyUserForm });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showPasswordCol, setShowPasswordCol] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mess<UserRow[]>("admin.users.list");
      setRows(Array.isArray(res) ? res : []);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "ইউজার তালিকা লোড করা যায়নি", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    if (app.role === "admin") {
      mess<{ id: string; name: string }[]>("admin.offices.list")
        .then((list) => setOffices(Array.isArray(list) ? list.map((o) => ({ id: o.id, name: o.name })) : []))
        .catch(() => setOffices([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filterOffice === "__none__") list = list.filter((u) => !u.officeId);
    else if (filterOffice) list = list.filter((u) => u.officeId === filterOffice);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((u) => `${u.name} ${u.userId} ${u.phone} ${u.email} ${u.officeName} ${u.role}`.toLowerCase().includes(q));
    }
    return list;
  }, [rows, filterOffice, query]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyUserForm, officeId: app.office?.id ?? "", status: "active" });
    setFormOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u.id);
    setForm({
      id: u.id,
      userId: u.userId,
      name: u.name,
      email: u.email,
      phone: u.phone,
      branch: u.branch,
      officeId: u.officeId ?? "",
      role: u.role,
      status: u.status,
      password: "",
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (form.userId.trim().length < 4) {
      app.toast("User ID কমপক্ষে ৪ অক্ষরের হতে হবে", "error");
      return;
    }
    if (!editing && form.password.trim().length < 4) {
      app.toast("নতুন ইউজারের জন্য পাসওয়ার্ড (৪+ অক্ষর) দিন", "error");
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = { ...form };
    if (editing) {
      payload.id = editing;
      if (!payload.password) delete payload.password;
    }
    const res = await app.call<{ id: string }>(editing ? "admin.user.update" : "admin.user.create", payload);
    setBusy(false);
    if (res) {
      app.toast(editing ? "ইউজার হালনাগাদ হয়েছে ✓" : "নতুন ইউজার তৈরি হয়েছে ✓", "success");
      setFormOpen(false);
      await load();
    }
  };

  const setStatus = async (u: UserRow, status: string) => {
    const res = await app.call<{ id: string; status: string }>("admin.user.status", { id: u.id, status });
    if (res) {
      app.toast(`${u.name} → ${res.status}`, "success");
      await load();
    }
  };

  const resetPw = async () => {
    if (!pwUser) return;
    if (pw.trim().length < 4) {
      app.toast("পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে", "error");
      return;
    }
    setPwBusy(true);
    const res = await app.call<{ ok: boolean }>("admin.user.resetPassword", { id: pwUser.id, password: pw.trim() });
    setPwBusy(false);
    if (res?.ok) {
      app.toast(`${pwUser.name}-এর পাসওয়ার্ড রিসেট হয়েছে ✓ (সব পুরনো সেশন বাতিল হয়েছে)`, "success");
      setPwUser(null);
      setPw("");
    }
  };

  const runDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const res = await app.call<{ deleted: boolean }>("admin.user.delete", { id: deleting.id });
    setDeleteBusy(false);
    if (res?.deleted) {
      app.toast(`${deleting.name} মুছে ফেলা হয়েছে`, "success");
      setDeleting(null);
      await load();
    }
  };

  const set = (k: keyof typeof emptyUserForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const hasPlain = rows.some((r) => r.passwordPlain !== undefined);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input input-sm h-9 w-full max-w-[200px] flex-1" placeholder="নাম / User ID / ফোন খুঁজুন…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {app.role === "admin" ? (
          <Select className="input input-sm h-9 w-auto" value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)}>
            <option value="">সব অফিস</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="__none__">প্ল্যাটফর্ম (কোনো অফিস নেই)</option>
          </Select>
        ) : null}
        {hasPlain ? (
          <label className="flex items-center gap-1.5 text-[12px] font-semibold">
            <input type="checkbox" className="h-4 w-4" checked={showPasswordCol} onChange={(e) => setShowPasswordCol(e.target.checked)} />
            পাসওয়ার্ড দেখান
          </label>
        ) : null}
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={openCreate}>
          + নতুন ইউজার
        </button>
      </div>

      <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-[11.5px] font-semibold text-[var(--warn)]">
        🔒 প্রোডাকশন সিকিউরিটির জন্য পাসওয়ার্ড কখনো প্লেইন টেক্সটে দেখানো হয় না — সব পাসওয়ার্ড bcrypt হ্যাশ হিসেবে সংরক্ষিত।
        প্রয়োজনে <strong>Reset Password</strong> ব্যবহার করুন।
      </div>

      {loading ? (
        <Loader label="Loading users…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon="👥" title="কোনো ইউজার পাওয়া যায়নি" />
      ) : (
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 1050 }}>
            <thead>
              <tr>
                <th>ইউজার</th>
                <th>User ID</th>
                <th>অফিস</th>
                <th className="text-center">রোল</th>
                <th className="text-center">স্ট্যাটাস</th>
                <th>Last Login</th>
                {showPasswordCol && hasPlain ? <th>পাসওয়ার্ড (dev)</th> : null}
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="block font-bold">{u.name}</span>
                    <span className="muted block text-[11px]">
                      {u.phone || "—"} • {u.email || "no email"}
                    </span>
                  </td>
                  <td className="tabular-nums">{u.userId}</td>
                  <td>
                    <span className="block text-[12px]">{u.officeName || "—"}</span>
                    {u.officeId ? <span className="muted block text-[10.5px]">{u.officeId}</span> : null}
                  </td>
                  <td className="text-center">
                    <Badge tone={u.role === "admin" ? "danger" : u.role === "manager" ? "brand" : u.role === "audit" ? "warn" : "muted"}>
                      {ROLE_LABEL[u.role]?.bn ?? u.role}
                    </Badge>
                  </td>
                  <td className="text-center">
                    <StatusPill status={u.status} />
                  </td>
                  <td className="text-[11.5px] tabular-nums">{u.lastLogin ? toDisplayDateTime(u.lastLogin) : "কখনো না"}</td>
                  {showPasswordCol && hasPlain ? <td className="font-mono text-[11px]">{u.passwordPlain ?? "(hashed)"}</td> : null}
                  <td className="text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                        Edit
                      </button>
                      {u.status === "pending" ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void setStatus(u, "approved")}>
                          Approve
                        </button>
                      ) : null}
                      {u.status === "active" || u.status === "approved" ? (
                        <button type="button" className="btn btn-ghost btn-sm text-[var(--warn)]" onClick={() => void setStatus(u, "inactive")}>
                          Deactivate
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm text-[var(--ok)]" onClick={() => void setStatus(u, "active")}>
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setPwUser(u);
                          setPw("");
                        }}
                      >
                        Reset PW
                      </button>
                      {u.id !== app.user?.id ? (
                        <button type="button" className="btn btn-ghost btn-sm text-[var(--danger)]" onClick={() => setDeleting(u)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? "ইউজার সম্পাদনা / Edit User" : "নতুন ইউজার / New User"}
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {busy ? "সংরক্ষণ হচ্ছে…" : "Save"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="User ID / মোবাইল" required hint="লগইনে ব্যবহৃত হবে">
            <TextInput value={form.userId} onChange={set("userId")} />
          </Field>
          <Field label="নাম" required>
            <TextInput value={form.name} onChange={set("name")} />
          </Field>
          <Field label="মোবাইল">
            <TextInput value={form.phone} onChange={set("phone")} inputMode="tel" />
          </Field>
          <Field label="ইমেইল">
            <TextInput value={form.email} onChange={set("email")} type="email" />
          </Field>
          {app.role === "admin" ? (
            <Field label="অফিস" required={form.role !== "admin"}>
              <Select value={form.officeId} onChange={set("officeId")}>
                <option value="">— প্ল্যাটফর্ম লেভেল (কোনো অফিস নেই) —</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="রোল / Role">
            <Select value={form.role} onChange={set("role")}>
              <option value="member">member — সদস্য</option>
              <option value="manager">manager — ম্যানেজার</option>
              <option value="audit">audit — রিপোর্ট শুধু দেখতে পারবে</option>
              {app.role === "admin" ? <option value="admin">admin — প্ল্যাটফর্ম অ্যাডমিন</option> : null}
            </Select>
          </Field>
          <Field label="স্ট্যাটাস">
            <Select value={form.status} onChange={set("status")}>
              <option value="active">active</option>
              <option value="approved">approved</option>
              <option value="pending">pending</option>
              <option value="inactive">inactive</option>
              <option value="rejected">rejected</option>
            </Select>
          </Field>
          <Field label="ব্রাঞ্চ">
            <TextInput value={form.branch} onChange={set("branch")} />
          </Field>
          {!editing ? (
            <Field label="পাসওয়ার্ড" required hint="কমপক্ষে ৪ অক্ষর — bcrypt দিয়ে হ্যাশ হবে">
              <TextInput value={form.password} onChange={set("password")} type="text" />
            </Field>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!pwUser}
        title={`পাসওয়ার্ড রিসেট — ${pwUser?.name ?? ""}`}
        subtitle="রিসেট করলে এই ইউজারের সব সক্রিয় সেশন বাতিল হয়ে যাবে।"
        onClose={() => setPwUser(null)}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setPwUser(null)} disabled={pwBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void resetPw()} disabled={pwBusy}>
              {pwBusy ? "রিসেট হচ্ছে…" : "Reset Password"}
            </button>
          </div>
        }
      >
        <Field label="নতুন পাসওয়ার্ড" required hint="কমপক্ষে ৪ অক্ষর">
          <TextInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="নতুন পাসওয়ার্ড" />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        busy={deleteBusy}
        title="ইউজার মুছে ফেলবেন?"
        message={`${deleting?.name ?? ""} (${deleting?.userId ?? ""}) স্থায়ীভাবে মুছে যাবে।`}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void runDelete()}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Audit trail (spec §97)
 * ══════════════════════════════════════════════════════════ */

function AuditPanel() {
  const app = useApp();
  const [rows, setRows] = useState<AuditLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"office" | "all">(app.role === "admin" ? "all" : "office");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mess<AuditLogDTO[]>("audit.list", { scope });
      setRows(Array.isArray(res) ? res : []);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "অডিট লগ লোড করা যায়নি", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => `${r.userName} ${r.action} ${r.entity} ${r.message} ${r.officeId}`.toLowerCase().includes(q));
  }, [rows, query]);

  if (!app.can("audit.view")) {
    return <EmptyState icon="🔒" title="অডিট ট্রেইল দেখার অনুমতি নেই" hint="শুধু অ্যাডমিন ও অডিট রোল অডিট লগ দেখতে পারবেন।" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input input-sm h-9 w-full max-w-[240px] flex-1" placeholder="ইউজার / অ্যাকশন খুঁজুন…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {app.role === "admin" ? (
          <SegmentedButtons
            value={scope}
            onChange={(v) => setScope(v)}
            options={[
              { value: "all", label: "সব অফিস" },
              { value: "office", label: "বর্তমান অফিস" },
            ]}
            size="sm"
          />
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => void load()}>
          রিফ্রেশ
        </button>
      </div>

      {loading ? (
        <Loader label="Loading audit trail…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon="📜" title="কোনো অডিট লগ নেই" />
      ) : (
        <Card bodyClass="p-0">
          <div className="table-wrap" style={{ borderRadius: 0, borderWidth: 0 }}>
            <table className="data" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>সময়</th>
                  <th>ইউজার</th>
                  <th>রোল</th>
                  <th>অ্যাকশন</th>
                  <th>এন্টিটি</th>
                  <th>অফিস</th>
                  <th className="text-center">ফলাফল</th>
                  <th>মেসেজ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular-nums">{toDisplayDateTime(r.at)}</td>
                    <td className="font-semibold">{r.userName || "—"}</td>
                    <td>
                      <Badge tone="muted">{r.role}</Badge>
                    </td>
                    <td>
                      <code className="text-[11.5px]">{r.action}</code>
                    </td>
                    <td className="muted text-[11.5px]">
                      {r.entity}
                      {r.entityId ? ` • ${r.entityId.slice(0, 16)}` : ""}
                    </td>
                    <td className="muted text-[11.5px]">{r.officeId || "—"}</td>
                    <td className="text-center">
                      <Badge tone={r.ok ? "ok" : "danger"}>{r.ok ? "✓" : "✗"}</Badge>
                    </td>
                    <td className="muted max-w-[260px] truncate text-[11.5px]">{r.message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
