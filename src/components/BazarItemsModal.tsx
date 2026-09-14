"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { suggestBazarItems } from "@/lib/bazar-items";
import type { BazarLine } from "@/lib/types";

/* ══════════════════════════════════════════════════════════
 *  বাজারের আইটেম পপআপ
 *  • আইটেম লিখলে বাংলাদেশি বাজার তালিকা থেকে বাংলা সাজেশন
 *  • কোয়ান্টিটি / দাম / মোট — যেকোনো দুটি দিলে তৃতীয়টি অটো
 *  • টেবিলে জমা হয়, এডিট/ডিলিট করা যায়, সেভ না করা পর্যন্ত থাকে
 *  • সেভ চাপলে মোট টাকা বাজার এন্ট্রির পরিমাণ ঘরে বসে যায়
 * ══════════════════════════════════════════════════════════ */

export interface BazarItemsModalProps {
  open: boolean;
  lines: BazarLine[];
  onChange: (lines: BazarLine[]) => void;
  onClose: () => void;
  onApply: (lines: BazarLine[], total: number) => void;
  disabled?: boolean;
}

export function linesTotal(lines: BazarLine[]): number {
  return round2(lines.reduce((sum, l) => sum + round2(toNumber(l.qty) * toNumber(l.price)), 0));
}

/** আইটেমের লাইনগুলো থেকে এক লাইনের সারাংশ (বাজার এন্ট্রির আইটেম ঘরে বসে) */
export function linesToText(lines: BazarLine[]): string {
  return lines
    .map((l) => `${l.item} ${Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)} × ৳${round2(l.price)}`)
    .join(", ")
    .slice(0, 300);
}

type FieldKey = "qty" | "price" | "total";

export function BazarItemsModal({ open, lines, onChange, onClose, onApply, disabled }: BazarItemsModalProps) {
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [focusItem, setFocusItem] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItem("");
    setQty("");
    setPrice("");
    setTotal("");
    setEditing(null);
    setError("");
  }, [open]);

  const suggestions = useMemo(() => (focusItem && item.trim() ? suggestBazarItems(item, 8) : []), [item, focusItem]);
  const grandTotal = useMemo(() => linesTotal(lines), [lines]);

  const clearInputs = () => {
    setItem("");
    setQty("");
    setPrice("");
    setTotal("");
    setEditing(null);
    setError("");
  };

  /** যেকোনো দুটি ঘর পূরণ হলে তৃতীয়টি নিজে থেকে হিসাব হয়ে যায় */
  const onField = (changed: FieldKey, raw: string) => {
    const clean = raw.replace(/[^\d.]/g, "");
    let q = qty;
    let p = price;
    let t = total;
    if (changed === "qty") q = clean;
    if (changed === "price") p = clean;
    if (changed === "total") t = clean;

    const qn = toNumber(q);
    const pn = toNumber(p);
    const tn = toNumber(t);
    const filled = { q: q.trim() !== "", p: p.trim() !== "", t: t.trim() !== "" };

    if (changed === "qty") {
      if (filled.p) t = String(round2(qn * pn));
      else if (filled.t && qn > 0) p = String(round2(tn / qn));
    } else if (changed === "price") {
      if (filled.q) t = String(round2(qn * pn));
      else if (filled.t && pn > 0) q = String(round2(tn / pn));
    } else if (qn > 0) {
      p = String(round2(tn / qn));
    } else if (pn > 0) {
      q = String(round2(tn / pn));
    }

    setQty(q);
    setPrice(p);
    setTotal(t);
    setError("");
  };

  const addOrUpdate = () => {
    const name = item.trim();
    const q = round2(toNumber(qty));
    const p = round2(toNumber(price));
    const t = round2(toNumber(total));
    if (!name) return setError("আইটেমের নাম লিখুন বা সাজেশন থেকে নিন");
    const known = [q > 0, p > 0, t > 0].filter(Boolean).length;
    if (known < 2) return setError("কোয়ান্টিটি, দাম, মোট — যেকোনো দুটি ঘর পূরণ করুন (তৃতীয়টি অটো হবে)");

    let finalQty = q;
    let finalPrice = p;
    if (finalQty <= 0 && finalPrice > 0) finalQty = round2(t / finalPrice);
    if (finalPrice <= 0 && finalQty > 0) finalPrice = round2(t / finalQty);

    const line: BazarLine = { item: name.slice(0, 60), qty: Math.max(0, finalQty), price: Math.max(0, finalPrice) };
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
    setTotal(String(round2(l.qty * l.price)));
    setError("");
  };

  const remove = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
    if (editing === index) clearInputs();
    else if (editing !== null && editing > index) setEditing(editing - 1);
  };

  const pickSuggestion = (name: string) => {
    setItem(name);
    setFocusItem(false);
    setError("");
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
            <strong className="tabular-nums text-[16px]">৳ {formatMoney(grandTotal)}</strong>
            <span className="muted text-[12px]"> ({lines.length}টি আইটেম)</span>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              বন্ধ করুন
            </button>
            <button type="button" className="btn btn-primary" disabled={disabled || lines.length === 0} onClick={() => onApply(lines, grandTotal)}>
              ✓ সেভ (৳ {formatMoney(grandTotal)})
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
        {/* আইটেম + বাংলা সাজেশন */}
        <div className="relative">
          <label className="label" htmlFor="bz-item">
            আইটেম
          </label>
          <input
            id="bz-item"
            className="input"
            value={item}
            disabled={disabled}
            placeholder="যেমন: আলু, রুই মাছ, সয়াবিন তেল"
            autoComplete="off"
            onChange={(e) => setItem(e.target.value)}
            onFocus={() => setFocusItem(true)}
            onBlur={() => window.setTimeout(() => setFocusItem(false), 160)}
            autoFocus
          />
          {suggestions.length ? (
            <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--brand-soft)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s.name)}
                >
                  <span className="font-semibold">{s.name}</span>
                  <span className="muted text-[11px]">{s.group}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* তিনটি ঘর — যেকোনো দুটি দিলে তৃতীয়টি অটো */}
        <div className="grid grid-cols-3 gap-2">
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
              onChange={(e) => onField("qty", e.target.value)}
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
              onChange={(e) => onField("price", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bz-total">
              মোট মূল্য (৳)
            </label>
            <input
              id="bz-total"
              className="input tabular-nums"
              type="number"
              min={0}
              step="0.01"
              value={total}
              disabled={disabled}
              placeholder="70"
              onChange={(e) => onField("total", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={disabled}>
            {editing === null ? "➕ এড" : "✓ আপডেট"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearInputs} disabled={disabled}>
            রিসেট
          </button>
          <span className="muted ml-auto text-[11.5px]">যেকোনো দুটি ঘর দিলে তৃতীয়টি নিজে থেকে বসবে</span>
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
                  <th className="num">মোট</th>
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
                  <td className="num font-extrabold tabular-nums">৳ {formatMoney(grandTotal)}</td>
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
