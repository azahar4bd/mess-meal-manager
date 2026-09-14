"use client";

import React, { useMemo, useState } from "react";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  MoneyInput,
  Modal,
  NumberInput,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui";
import { BAZAR_CATEGORIES, BAZAR_CATEGORY_BN, type BazarCategory } from "@/lib/types";

/* ══════════════════════════════════════════════════════════
 *  Generic entry panel — form + table + edit modal + delete
 *  confirmation, used by Bazar / Fund / Income / Extras.
 *  Mobile-first: big inputs, horizontal-scroll tables.
 * ══════════════════════════════════════════════════════════ */

export type FieldType = "date" | "text" | "textarea" | "number" | "money" | "select" | "member";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  step?: number;
  half?: boolean;
  searchKeys?: (row: never) => string;
}

export type FormState = Record<string, string>;

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
  footer?: (rows: T[]) => React.ReactNode;
  hideOnMobile?: boolean;
}

/** ফিল্ডের ভেতরে অতিরিক্ত কন্ট্রোল বসানোর সুযোগ (যেমন আইটেম পপআপের আইকন) */
export interface FieldExtraCtx {
  value: string;
  setValue: (key: string, value: string) => void;
  values: FormState;
  editingId: string | null;
}

export interface EntryPanelProps<T extends { id: string }> {
  title: string;
  subtitle?: string;
  fields: FieldDef[];
  rows: T[];
  columns: ColumnDef<T>[];
  canWrite: boolean;
  closedNotice?: string | null;
  initialValues: () => FormState;
  toForm: (row: T) => FormState;
  onSubmit: (values: FormState, editingId: string | null) => Promise<boolean>;
  onDelete?: (row: T) => Promise<boolean>;
  emptyTitle: string;
  emptyHint?: string;
  emptyIcon?: string;
  addLabel?: string;
  search?: (row: T) => string;
  members?: { id: string; name: string; isActive: boolean }[];
  totalLabel?: string;
  toolbar?: React.ReactNode;
  loading?: boolean;
  formTitle?: string;
  /** নির্দিষ্ট ফিল্ডের উপরে অতিরিক্ত UI (key = ফিল্ডের key) */
  fieldExtra?: Record<string, (ctx: FieldExtraCtx) => React.ReactNode>;
  /** এন্ট্রি ফর্ম খোলার সঙ্গে সঙ্গে — ড্রাফট লোড/রিসেট করার জন্য */
  onFormOpen?: (editingId: string | null, values: FormState) => void;
}

export function EntryPanel<T extends { id: string }>(props: EntryPanelProps<T>) {
  const {
    title,
    subtitle,
    fields,
    rows,
    columns,
    canWrite,
    closedNotice,
    initialValues,
    toForm,
    onSubmit,
    onDelete,
    emptyTitle,
    emptyHint,
    emptyIcon = "📭",
    addLabel = "+ নতুন এন্ট্রি",
    search,
    members = [],
    totalLabel = "মোট",
    toolbar,
    loading,
    formTitle = "এন্ট্রি",
    fieldExtra,
    onFormOpen,
  } = props;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormState>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim() || !search) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (search(r) ?? "").toLowerCase().includes(q));
  }, [rows, query, search]);

  const openCreate = () => {
    const fresh = initialValues();
    setEditingId(null);
    setValues(fresh);
    setErrors({});
    setFormOpen(true);
    onFormOpen?.(null, fresh);
  };

  const openEdit = (row: T) => {
    const loaded = toForm(row);
    setEditingId(row.id);
    setValues(loaded);
    setErrors({});
    setFormOpen(true);
    onFormOpen?.(row.id, loaded);
  };

  const setField = (key: string, value: string) => setValues((p) => ({ ...p, [key]: value }));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const f of fields) {
      if (f.required && !String(values[f.key] ?? "").trim()) nextErrors[f.key] = `${f.label} আবশ্যক`;
      if ((f.type === "money" || f.type === "number") && String(values[f.key] ?? "").trim()) {
        const n = Number(values[f.key]);
        if (!Number.isFinite(n)) nextErrors[f.key] = "সঠিক সংখ্যা লিখুন";
        else if (n < 0) nextErrors[f.key] = "ঋণাত্মক হতে পারবে না";
      }
      if (f.type === "member" && String(values[f.key] ?? "").trim() === "" && values.type === "individual") {
        nextErrors[f.key] = "Individual খরচের জন্য সদস্য নির্বাচন করুন";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    const okSubmit = await onSubmit(values, editingId);
    setBusy(false);
    if (okSubmit) {
      setFormOpen(false);
      setEditingId(null);
      setValues(initialValues());
    }
  };

  const runDelete = async () => {
    if (!deleting || !onDelete) return;
    setDeleteBusy(true);
    const okDelete = await onDelete(deleting);
    setDeleteBusy(false);
    if (okDelete) setDeleting(null);
  };

  const renderField = (f: FieldDef) => {
    const value = values[f.key] ?? "";
    const error = errors[f.key];
    const disabled = !canWrite;

    if (f.type === "member") {
      return (
        <Field key={f.key} label={f.label} required={f.required} error={error} hint={f.hint} className={f.half ? "" : "sm:col-span-2"}>
          <Select value={value} disabled={disabled} onChange={(e) => setField(f.key, e.target.value)}>
            <option value="">— নির্বাচন করুন —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isActive ? "" : " (নিষ্ক্রিয়)"}
              </option>
            ))}
          </Select>
        </Field>
      );
    }

    if (f.type === "select") {
      const options =
        f.key === "category"
          ? BAZAR_CATEGORIES.map((c: BazarCategory) => ({ value: c, label: `${BAZAR_CATEGORY_BN[c]} / ${c}` }))
          : (f.options ?? []);
      return (
        <Field key={f.key} label={f.label} required={f.required} error={error} hint={f.hint}>
          <Select value={value} disabled={disabled} onChange={(e) => setField(f.key, e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    }

    if (f.type === "textarea") {
      return (
        <Field key={f.key} label={f.label} error={error} hint={f.hint} className="sm:col-span-2">
          <TextArea value={value} disabled={disabled} placeholder={f.placeholder} onChange={(e) => setField(f.key, e.target.value)} />
        </Field>
      );
    }

    if (f.type === "money") {
      const extra = fieldExtra?.[f.key]?.({ value, setValue: setField, values, editingId });
      return (
        <Field key={f.key} label={f.label} required={f.required} error={error} hint={f.hint}>
          {extra}
          <MoneyInput
            value={value}
            disabled={disabled}
            placeholder={f.placeholder}
            step={f.step ?? "0.01"}
            min={f.min ?? 0}
            onChange={(e) => setField(f.key, e.target.value)}
          />
        </Field>
      );
    }

    if (f.type === "number") {
      return (
        <Field key={f.key} label={f.label} required={f.required} error={error} hint={f.hint}>
          <NumberInput
            value={value}
            disabled={disabled}
            placeholder={f.placeholder}
            step={f.step ?? 1}
            min={f.min ?? 0}
            onChange={(e) => setField(f.key, e.target.value)}
          />
        </Field>
      );
    }

    return (
      <Field key={f.key} label={f.label} required={f.required} error={error} hint={f.hint}>
        <TextInput
          value={value}
          disabled={disabled}
          type={f.type === "date" ? "date" : "text"}
          placeholder={f.placeholder}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      </Field>
    );
  };

  const formBody = (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map(renderField)}</div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !canWrite}>
          {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "Save Changes" : "Save"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[19px] font-extrabold leading-tight">{title}</h1>
          {subtitle ? <p className="muted text-[12.5px]">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {canWrite ? (
            <button type="button" className="btn btn-primary btn-sm sm:hidden" onClick={openCreate}>
              {addLabel}
            </button>
          ) : null}
        </div>
      </div>

      {closedNotice ? (
        <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--warn)]">
          {closedNotice}
        </div>
      ) : null}

      {/* inline add form (desktop friendly) */}
      {canWrite ? (
        <div className="card hidden p-3 sm:block sm:p-4">
          <div className="mb-2 text-[13px] font-bold">{formTitle}</div>
          {formBody}
        </div>
      ) : null}

      {search ? (
        <div className="flex justify-end">
          <input className="input input-sm h-9 w-full max-w-[240px]" placeholder="খুঁজুন…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-9 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={query ? "🔍" : emptyIcon}
          title={query ? "কিছু পাওয়া যায়নি" : emptyTitle}
          hint={query ? "অন্য কিছু লিখে খুঁজে দেখুন।" : emptyHint}
          action={
            !query && canWrite ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                {addLabel}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === "right" ? "num" : c.align === "center" ? "text-center" : ""}>
                    {c.header}
                  </th>
                ))}
                {canWrite ? <th className="text-center">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === "right" ? "num" : c.align === "center" ? "text-center" : ""}>
                      <span className={c.hideOnMobile ? "hidden sm:inline" : ""}>{c.render(row)}</span>
                    </td>
                  ))}
                  {canWrite ? (
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>
                          Edit
                        </button>
                        {onDelete ? (
                          <button type="button" className="btn btn-ghost btn-sm text-[var(--danger)]" onClick={() => setDeleting(row)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            {columns.some((c) => c.footer) ? (
              <tfoot>
                <tr>
                  {columns.map((c, i) => (
                    <td key={c.key} className={c.align === "right" ? "num" : ""}>
                      {c.footer ? c.footer(filtered) : i === 0 ? totalLabel : ""}
                    </td>
                  ))}
                  {canWrite ? <td /> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {/* mobile / edit modal (spec §75) */}
      <Modal
        open={formOpen}
        title={editingId ? `${formTitle} — Edit` : formTitle}
        subtitle={editingId ? "পরিবর্তন করে Save চাপুন" : undefined}
        onClose={() => setFormOpen(false)}
        wide
      >
        {formBody}
      </Modal>

      <ConfirmDialog open={!!deleting} busy={deleteBusy} onCancel={() => setDeleting(null)} onConfirm={() => void runDelete()} />
    </div>
  );
}
