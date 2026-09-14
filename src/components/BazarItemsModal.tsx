"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { formatMoney, round2, toNumber } from "@/lib/format";
import type { BazarLine } from "@/lib/types";

/* ══════════════════════════════════════════════════════════
 *  বাজারের আইটেম পপআপ
 *  আইটেম + কোয়ান্টিটি + দাম → মোট; টেবিলে জমা হয়;
 *  এডিট/ডিলিট করা যায়; “সেভ” চাপলে মোট টাকা বাজার
 *  এন্ট্রির পরিমাণ ঘরে বসে যায় (ম্যানুয়ালিও বদলানো যায়)।
 * ══════════════════════════════════════════════════════════ */

export interface BazarItemsModalProps {
  open: boolean;
  /** ড্রাফট লাইন — প্যারেন্ট রাখছে, তাই পপআপ বন্ধ করলেও থেকে যায় */
  lines: BazarLine[];
  onChange: (lines: BazarLine[]) => void;
  onClose: () => void;
  onApply: (lines: BazarLine[], total: number) => void;
  disabled?: boolean;
}

export function linesTotal(lines: BazarLine[]): number {
  return round2(lines.reduce((sum, l) => sum + round2(toNumber(l.qty) * toNumber(l.price)), 0));
}

export function BazarItemsModal({ open, lines, onChange, onClose, onApply, disabled }: BazarItemsModalProps) {
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setItem("");
    setQty("");
    setPrice("");
    setEditing(null);
    setError("");
  }, [open]);

  const lineTotal = round2(toNumber(qty) * toNumber(price));
  const total = useMemo(() => linesTotal(lines), [lines]);

  const clearInputs = () => {
    setItem("");
    setQty("");
    setPrice("");
    setEditing(null);
    setError("");
  };

  const addOrUpdate = () => {
    const name = item.trim();
    const q = round2(toNumber(qty));
    const p = round2(toNumber(price));
    if (!name) return setError("আইটেমের নাম লিখুন");
    if (q <= 0) return setError("কোয়ান্টিটি ০ এর বেশি হতে হবে");
    if (p < 0) return setError("দাম ঠিক নয়");
    setError("");
    const line: BazarLine = { item: name.slice(0, 60), qty: q, price: p };
    if (editing === null) onChange([...lines, line]);
    else onChange(lines.map((l, i) => (i === editing ? line : l)));
    clearInputs();
  };

  const startEdit = (index: number) => {
    const l = lines[index];
    if (!l) return;
    setEditing(index);
    setItem(l.item);
    setQty(String(l.qty));
    setPrice(String(l.price));
    setError("");
  };

  const remove = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
    if (editing === index) clearInputs();
    else if (editing !== null && editing > index) setEditing(editing - 1);
  };

  return (
    <Modal
      open={open}
      title="🧾 আইটেম হিসাব"
      subtitle="আইটেম যোগ করে সেভ চাপলে মোট টাকা পরিমাণের ঘরে বসে যাবে"
      onClose={onClose}
      wide
      z="z-[120]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[14px]">
            <span className="muted">সর্বমোট: </span>
            <strong className="tabular-nums text-[16px]">৳ {formatMoney(total)}</strong>
            <span className="muted text-[12px]"> ({lines.length}টি আইটেম)</span>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              বন্ধ করুন
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || lines.length === 0}
              onClick={() => onApply(lines, total)}
            >
              ✓ সেভ (৳ {formatMoney(total)})
            </button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) addOrUpdate();
        }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="col-span-2">
            <label className="label" htmlFor="bz-item">
              আইটেম
            </label>
            <input
              id="bz-item"
              className="input"
              value={item}
              disabled={disabled}
              placeholder="আলু"
              onChange={(e) => setItem(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="bz-qty">
              কোয়ান্টিটি
            </label>
            <input
              id="bz-qty"
              className="input tabular-nums"
              type="number"
              min={0}
              step="0.25"
              value={qty}
              disabled={disabled}
              placeholder="2"
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bz-price">
              দাম (৳)
            </label>
            <input
              id="bz-price"
              className="input tabular-nums"
              type="number"
              min={0}
              step="0.01"
              value={price}
              disabled={disabled}
              placeholder="35"
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[130px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--brand-soft)] px-3 py-2">
            <span className="muted block text-[11px] font-semibold">টোটাল প্রাইস</span>
            <strong className="tabular-nums text-[15px]">৳ {formatMoney(lineTotal)}</strong>
          </div>
          <button type="submit" className="btn btn-primary" disabled={disabled}>
            {editing === null ? "➕ এড" : "✓ আপডেট"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearInputs} disabled={disabled}>
            রিসেট
          </button>
        </div>

        {error ? <div className="pill pill-danger">{error}</div> : null}

        {lines.length === 0 ? (
          <div className="muted rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-[12.5px]">
            এখনো কোনো আইটেম যোগ করা হয়নি
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ minWidth: 34 }}>#</th>
                  <th>আইটেম</th>
                  <th className="num">কোয়ান্টিটি</th>
                  <th className="num">দাম</th>
                  <th className="num">টোটাল</th>
                  {!disabled ? <th className="text-center">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.item}-${i}`} className={editing === i ? "bg-[var(--brand-soft)]" : ""}>
                    <td className="muted tabular-nums">{i + 1}</td>
                    <td className="font-semibold">{l.item}</td>
                    <td className="num tabular-nums">{Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)}</td>
                    <td className="num tabular-nums">৳ {formatMoney(l.price)}</td>
                    <td className="num font-bold tabular-nums">৳ {formatMoney(round2(l.qty * l.price))}</td>
                    {!disabled ? (
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(i)}>
                            এডিট
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm text-[var(--danger)]" onClick={() => remove(i)}>
                            ডিলিট
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>মোট</td>
                  <td className="num font-extrabold tabular-nums">৳ {formatMoney(total)}</td>
                  {!disabled ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </form>
    </Modal>
  );
}
