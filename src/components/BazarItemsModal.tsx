"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { suggestBazarItems } from "@/lib/bazar-items";
import { computeTriad, triadReady, triadValues, type Triad, type TriadField } from "@/lib/triad";
import type { BazarLine } from "@/lib/types";

/* ══════════════════════════════════════════════════════════
 *  বাজারের আইটেম পপআপ
 *  • আইটেম লিখলে বাংলাদেশি বাজার তালিকা থেকে বাংলা সাজেশন
 *    + আগের বাজার থেকে কাস্টম আইটেমও মনে থাকে
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
  historyItems?: string[];
}

export function linesTotal(lines: BazarLine[]): number {
  return round2(lines.reduce((sum, l) => sum + round2(toNumber(l.qty) * toNumber(l.price)), 0));
}

/** আইটেমের লাইনগুলো থেকে এক লাইনের সারাংশ (বাজার এন্ট্রির আইটেম ঘরে বসে) */
export function linesToText(lines: BazarLine[]): string {
  return lines
    .map((l) => {
      // পরিমাণ/দাম না থাকলে এটি এখনো ড্রাফট আইটেম — মূল বাজার ঘরে দেখানোর মতো হিসাব নয়
      if (!(l.qty > 0) || !(l.price > 0)) return l.item;
      return `${l.item} ${Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)} × ৳${round2(l.price)}`;
    })
    .join(", ")
    .slice(0, 300);
}

export function BazarItemsModal({ open, lines, onChange, onClose, onApply, disabled, historyItems = [] }: BazarItemsModalProps) {
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  // কোন ঘরগুলোতে হাতে লেখা হয়েছে (সর্বোচ্চ ২) — বাকিটা অটো-হিসাব হয়
  const [manual, setManual] = useState<TriadField[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [focusItem, setFocusItem] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItem("");
    setQty("");
    setPrice("");
    setTotal("");
    setManual([]);
    setEditing(null);
    setError("");
  }, [open]);

  const suggestions = useMemo(() => (focusItem && item.trim() ? suggestBazarItems(item, 8, historyItems) : []), [item, focusItem, historyItems]);
  const grandTotal = useMemo(() => linesTotal(lines), [lines]);
  const incompleteLines = useMemo(() => lines.filter((l) => !(l.qty > 0) || !(l.price > 0)), [lines]);
  const hasCurrentInput = Boolean(item.trim() || qty.trim() || price.trim() || total.trim());

  /** ফুটারের সেভে এড না চাপলেও বর্তমান আইটেমটি আগে লাইনে যোগ হয়। */
  const linesForSave = (): BazarLine[] => {
    if (!item.trim()) return lines;
    const tri: Triad = { qty, price, total, manual };
    const nextLine = triadReady(tri)
      ? (() => {
          const v = triadValues(tri);
          return { item: item.trim().slice(0, 60), qty: v.qty, price: v.price };
        })()
      : { item: item.trim().slice(0, 60), qty: 0, price: 0 };
    if (editing === null) return [...lines, nextLine];
    return lines.map((l, i) => (i === editing ? nextLine : l));
  };

  const clearInputs = () => {
    setItem("");
    setQty("");
    setPrice("");
    setTotal("");
    setManual([]);
    setEditing(null);
    setError("");
  };

  /**
   * যেকোনো দুটি ঘর পূরণ হলে তৃতীয়টি নিজে থেকে হিসাব হয়ে যায়।
   * হিসাবের পুরো লজিক pure ফাংশনে (src/lib/triad.ts) — টেস্ট করা যায়।
   */
  const onField = (changed: TriadField, raw: string) => {
    const next = computeTriad({ qty, price, total, manual }, changed, raw);
    setQty(next.qty);
    setPrice(next.price);
    setTotal(next.total);
    setManual(next.manual ?? []);
    setError("");
  };

  const addOrUpdate = () => {
    const name = item.trim();
    if (!name) return setError("আইটেমের নাম লিখুন বা সাজেশন থেকে নিন");
    const tri: Triad = { qty, price, total, manual };
    // শুধু নাম দিয়েও ড্রাফট আইটেম রাখা যাবে; পরে এডিট করে হিসাব পূরণ করা যাবে
    if (!triadReady(tri)) {
      if (editing === null) onChange([...lines, { item: name.slice(0, 60), qty: 0, price: 0 }]);
      else onChange(lines.map((l, i) => (i === editing ? { ...l, item: name.slice(0, 60), qty: 0, price: 0 } : l)));
      clearInputs();
      return;
    }

    const v = triadValues(tri);
    const line: BazarLine = { item: name.slice(0, 60), qty: v.qty, price: v.price };
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
    setManual(["qty", "price"]); // হাতে লেখা = qty + price; total অটো-হিসাব
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
            {incompleteLines.length ? <span className="text-[11px] font-semibold text-[var(--warn)]"> • {incompleteLines.length}টি ড্রাফট</span> : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              বন্ধ করুন
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || (!lines.length && !hasCurrentInput) || linesForSave().some((l) => !(l.qty > 0) || !(l.price > 0)) || linesTotal(linesForSave()) <= 0}
              title={incompleteLines.length ? "সেভের আগে অসম্পূর্ণ আইটেম এডিট করে কোয়ান্টিটি ও দাম দিন" : undefined}
              onClick={() => {
                const next = linesForSave();
                onApply(next, linesTotal(next));
              }}
            >
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
              inputMode="decimal"
              min={0}
              step="0.01"
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
              inputMode="decimal"
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
              inputMode="decimal"
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
          <span className="muted ml-auto text-[11.5px]">যেকোনো <strong>দুটি</strong> ঘর দিলেই সেভ হবে • Quantity না দিলে Total ÷ Unit price থেকে অটো হবে</span>
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
                    <td className="num tabular-nums">{l.qty > 0 ? (Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)) : "—"}</td>
                    <td className="num tabular-nums">{l.price > 0 ? <>৳ {formatMoney(l.price)}</> : "—"}</td>
                    <td className="num font-bold tabular-nums">{l.qty > 0 && l.price > 0 ? <>৳ {formatMoney(round2(l.qty * l.price))}</> : "—"}</td>
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
