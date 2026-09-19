/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  বাজারের আইটেম পপআপের "ত্রয়ী" হিসাব — কোয়ান্টিটি / দাম / মোট মূল্য
 *
 *  সূত্র (ইউজার-নির্দেশিত):
 *      quantity   = total / price
 *      price      = total / quantity
 *      total      = quantity × price
 *
 *  নিয়ম: যেকোনো দুটি ঘর পূরণ হলে তৃতীয়টি স্বয়ংক্রিয়ভাবে পূরণ হয়।
 *
 *  ডিজাইন-নীতি:
 *    • যে ঘরটি ব্যবহারকারী এডিট করছেন সেটিই "তাজা" — বাকি দুটির মধ্যে
 *      যেটি আগে পূরণ করা হয়েছে সেটি ধ্রুব ধরা হয়, ফাঁকাটি হিসাব হয়।
 *    • কোনো ঘর খালি করলে অন্য ঘর কখনো বদলায় না (পুরোনো বাগ: price → 0)।
 *    • ০ দিয়ে ভাগ কখনো হয় না (qty বা price ০ হলে সেই পথ এড়িয়ে যায়)।
 *    • pure function → সরাসরি টেস্ট করা যায় (scripts/test-settlement.ts)।
 * ───────────────────────────────────────────────────────────────────────────── */
import { round2, toNumber } from "@/lib/format";

export type TriadField = "qty" | "price" | "total";

export interface Triad {
  qty: string;
  price: string;
  total: string;
}

/** ০-সহ যেকোনো সংখ্যা "ভরা" ধরা হয় (total = ০ মানে ফ্রি/বোনাস — বৈধ)। */
function filled(v: string): boolean {
  const s = String(v ?? "").trim();
  if (s === "") return false;
  const n = toNumber(s);
  return Number.isFinite(n);
}

/** ধনাত্মক (> ০) কি না — ভাগ করার আগে এরকম চেক লাগে */
function positive(v: string): boolean {
  return toNumber(v) > 0;
}

/**
 * একটি ঘর বদলালে বাকি ঘরগুলো হিসাব করে নতুন ত্রয়ী ফেরত দেয়।
 * @param current বর্তমান তিনটি ঘরের মান (স্ট্রিং — ইনপুটের খসড়া অবস্থা)
 * @param changed ব্যবহারকারী কোন ঘরটি এডিট করছেন
 * @param raw     ইনপুট থেকে আসা কাঁচা মান
 */
export function computeTriad(current: Triad, changed: TriadField, raw: string): Triad {
  // শুধু সংখ্যা ও একটি দশমিক বিন্দু রাখা হয় — ফোন/কিবোর্ডের যেকোনো আবর্জনা বাদ
  const clean = String(raw ?? "")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");

  const next: Triad = { ...current, [changed]: clean };

  // ঘর খালি করা হলে অন্য কিছু ছোঁয় না — শুধু এই ঘরটিই খালি হয়
  if (clean.trim() === "") return next;

  const q = toNumber(next.qty);
  const p = toNumber(next.price);
  const t = toNumber(next.total);

  const qKnown = filled(next.qty) && q > 0;
  const pKnown = filled(next.price) && p > 0;
  const tKnown = filled(next.total);

  if (changed === "qty") {
    // quantity বদলেছে → দাম জানা থাকলে মোট, নইলে মোট থেকে দাম
    if (pKnown) next.total = String(round2(q * p));
    else if (tKnown) next.price = String(round2(t / q));
  } else if (changed === "price") {
    // price বদলেছে → কোয়ান্টিটি জানা থাকলে মোট, নইলে মোট থেকে কোয়ান্টিটি
    if (qKnown) next.total = String(round2(q * p));
    else if (tKnown && positive(next.price)) next.qty = String(round2(t / p));
  } else {
    // total বদলেছে → কোয়ান্টিটি জানা থাকলে দাম, নইলে দাম থেকে কোয়ান্টিটি
    if (qKnown) next.price = String(round2(t / q));
    else if (pKnown) next.qty = String(round2(t / p));
  }

  return next;
}

/** তিনটি ঘরের মধ্যে কমপক্ষে দুটি পূরণ আছে কি না (এড/আপডেট করার শর্ত) */
export function triadReady(tri: Triad): boolean {
  const known = [tri.qty, tri.price, tri.total].filter((v) => filled(v) && toNumber(v) > 0).length;
  return known >= 2;
}

/**
 * এড/আপডেটের আগে চূড়ান্ত মান — কোনোটি অনুপস্থিত থাকলে বাকি দুটি দিয়ে হিসাব করে নেয়।
 * { qty, price, total } — সবসময় ধনাত্মক।
 */
export function triadValues(tri: Triad): { qty: number; price: number; total: number } {
  let q = Math.max(0, round2(toNumber(tri.qty)));
  let p = Math.max(0, round2(toNumber(tri.price)));
  let t = Math.max(0, round2(toNumber(tri.total)));

  if (q <= 0 && p > 0 && t > 0) q = round2(t / p);
  if (p <= 0 && q > 0 && t > 0) p = round2(t / q);
  if (t <= 0 && q > 0 && p > 0) t = round2(q * p);

  return { qty: q, price: p, total: t };
}
