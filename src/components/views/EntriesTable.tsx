"use client";

import React, { useMemo, useState } from "react";
import { ConfirmDialog, EmptyState, Modal } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export interface Column<T> {
  key: string;
  header: string;
  headerEn?: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  footer?: (rows: T[]) => React.ReactNode;
  hideOnMobile?: boolean;
  sortValue?: (row: T) => string | number;
}

export interface EditState<T> {
  row: T;
}

export function EntriesTable<T extends { id: string }>({
  rows,
  columns,
  emptyTitle,
  emptyHint,
  emptyIcon = "📭",
  emptyAction,
  canEdit,
  onEdit,
  onDelete,
  editTitle = "এন্ট্রি সম্পাদনা",
  editSubtitle,
  renderForm,
  title,
  summaryLabel = "মোট",
  searchKeys,
  loading,
}: {
  rows: T[];
  columns: Column<T>[];
  emptyTitle: string;
  emptyHint?: string;
  emptyIcon?: string;
  emptyAction?: React.ReactNode;
  canEdit: boolean;
  onEdit?: (row: T) => Promise<boolean>;
  onDelete?: (row: T) => Promise<boolean>;
  editTitle?: string;
  editSubtitle?: string;
  renderForm?: (row: T, close: () => void) => React.ReactNode;
  title?: string;
  summaryLabel?: string;
  searchKeys?: (row: T) => string;
  loading?: boolean;
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim() || !searchKeys) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => searchKeys(r).toLowerCase().includes(q));
  }, [rows, query, searchKeys]);

  const total = useMemo(() => {
    return columns.some((c) => c.footer) ? filtered : filtered;
  }, [columns, filtered]);

  return (
    <div className="space-y-2">
      {title || searchKeys ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? <h3 className="section-title">{title}</h3> : <span />}
          {searchKeys ? (
            <input
              className="input input-sm h-9 w-full max-w-[220px]"
              placeholder="খুঁজুন…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-9 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title={query ? "কিছু পাওয়া যায়নি" : emptyTitle} hint={query ? "অন্য কিছু লিখে খুঁজে দেখুন।" : emptyHint} icon={query ? "🔍" : emptyIcon} action={query ? undefined : emptyAction} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === "right" ? "num" : c.align === "center" ? "text-center" : ""}>
                    <span className={c.hideOnMobile ? "hidden sm:inline" : ""}>{c.header}</span>
                    {c.headerEn ? <span className="muted ml-1 hidden text-[10px] font-semibold md:inline">/ {c.headerEn}</span> : null}
                  </th>
                ))}
                {canEdit ? <th className="text-center">Action</th> : null}
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
                  {canEdit ? (
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {onEdit ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(row)}>
                            Edit
                          </button>
                        ) : null}
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
                      {c.footer ? c.footer(total) : i === 0 ? summaryLabel : ""}
                    </td>
                  ))}
                  {canEdit ? <td /> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {editing && renderForm ? (
        <Modal open={!!editing} title={editTitle} subtitle={editSubtitle} onClose={() => setEditing(null)} wide>
          {renderForm(editing, () => setEditing(null))}
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting || !onDelete) return;
          setBusy(true);
          const okDelete = await onDelete(deleting);
          setBusy(false);
          if (okDelete) setDeleting(null);
        }}
      />
    </div>
  );
}

export function amountFooter(rows: { amount: number }[]): string {
  return `৳ ${formatMoney(rows.reduce((s, r) => s + (r.amount || 0), 0))}`;
}
