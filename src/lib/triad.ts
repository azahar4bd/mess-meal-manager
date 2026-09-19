/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  বাজারের আইটেম পপআপের "ত্রয়ী" হিসাব — কোয়ান্টিটি / দাম / মোট মূল্য
 *
 *  সূত্র (ইউজার-নির্দেশিত):
 *      quantity = total / price
 *      price    = total / quantity
 *      total    = quantity × price
 *
 *  নিয়ম: যেকোনো দুটি ঘর পূরণ হলে তৃতীয়টি স্বয়ংক্রিয়ভাবে পূরণ হয়।
 *
 *  মূল নীতি (বাগ-ফিক্স): "কে হাতে লিখেছে, কে অটো-ভরেছে" — সেটা মনে রাখা হয়।
 *  কারণ টাইপিং এক-এক করে অক্ষর হয় (মূল্য "20" = "2" তারপর "20")। আগের
 *  সংস্করণে প্রথম অক্ষরেই quantity = 80/2 = 40 বসে যেত, তারপরের অক্ষরে
 *  সেই ৪০-কেই "ভরা" ধরে মোট = 40×20 = 800 হয়ে যেত (আসল উত্তর: qty 4)।
 *
 *  এখন: সর্বোচ্চ ২টি ঘর "ম্যানুয়াল" (হাতে লেখা) থাকে, বাকি ১টিই "ডেরাইভড"
 *  (অটো-ভরা) — ডেরাইভড ঘরটি প্রতি কিস্ট্রোকে নতুন করে হিসাব হয়, কখনো
 *  ধ্রুব ধরা হয় না।
 * ───────────────────────────────────────────────────────────────────────────── */
import { round2, toNumber } from "@/lib/format";

export type TriadField = "qty" | "price" | "total";

export const TRIAD_FIELDS: TriadField[] = ["qty", "price", "total"];

export interface Triad {
  qty: string;
  price: string;
  total: string;
  /** ব্যবহারকারী নিজে কোন ঘরগুলোতে লিখেছেন — প্রবেশের ক্রমে, সর্বোচ্চ ২টি */
  manual?: TriadField[];
}

/** ০-সহ যেকোনো সংখ্যা "ভরা" ধরা হয় (total = ০ মানে ফ্রি/বোনাস — বৈধ)। */
function filled(v: string): boolean {
  const s = String(v ?? "").trim();
  if (s === "") return false;
  return Number.isFinite(toNumber(s));
}

/** "হাতে লেখা" তালিকা — সবসময় বৈধ ক্ষেত্র, সর্বোচ্চ ২টি */
function cleanManual(list: unknown): TriadField[] {
  const raw = Array.isArray(list) ? (list as unknown[]) : [];
  const out: TriadField[] = [];
  for (const f of raw) {
    if (TRIAD_FIELDS.includes(f as TriadField) && !out.includes(f as TriadField)) out.push(f as TriadField);
  }
  return out.slice(-2);
}

/**
 * একটি ঘর বদলালে বাকি ঘরগুলো হিসাব করে নতুন ত্রয়ী ফেরত দেয়।
 *
 * @param current বর্তমান অবস্থা (মান + কোন ঘরগুলো হাতে লেখা)
 * @param changed ব্যবহারকারী এখন কোন ঘরে লিখছেন
 * @param raw     ইনপুট থেকে আসা কাঁচা মান
 */
export function computeTriad(current: Triad, changed: TriadField, raw: string): Triad {
  // শুধু সংখ্যা ও একটি দশমিক বিন্দু রাখা হয় — কিবোর্ডের যেকোনো আবর্জনা বাদ
  const clean = String(raw ?? "")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");

  const manual = cleanManual(current.manual);

  // ঘর খালি করা হলে: অন্য ঘর কিছুই বদলায় না, শুধু এই ঘরটি "হাতে লেখা" তালিকা থেকে বের হয়
  if (clean.trim() === "") {
    return { ...current, [changed]: "", manual: manual.filter((f) => f !== changed) };
  }

  // এই ঘরটি এখন হাতে লেখা (সবার শেষে = সাম্প্রতিকতম)
  const ordered = manual.filter((f) => f !== changed);
  ordered.push(changed);
  // ২টির বেশি হলে: সবচেয়ে সাম্প্রতিক "অন্য" ঘরটিই অটো-হিসাবে চলে যায়
  if (ordered.length > 2) ordered.splice(ordered.length - 2, 1);

  const next: Triad = { ...current, [changed]: clean, manual: ordered };

  // হাতে লেখা কমপক্ষে ২টি না থাকলে কিছু হিসাব হয় না (একটি দিয়ে দুটি অজানা বের করা যায় না)
  if (ordered.length < 2) return next;

  const derived = TRIAD_FIELDS.find((f) => !ordered.includes(f));
  if (!derived) return next;

  const q = toNumber(next.qty);
  const p = toNumber(next.price);
  const t = toNumber(next.total);

  if (derived === "total") {
    next.total = String(round2(q * p));
  } else if (derived === "price") {
    if (q > 0) next.price = String(round2(t / q)); // ০ দিয়ে ভাগ নয়
  } else if (p > 0) {
    next.qty = String(round2(t / p)); // ০ দিয়ে ভাগ নয়
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
