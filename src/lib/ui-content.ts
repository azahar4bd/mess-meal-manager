import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { cryptoId } from "@/db/schema";
import { DEFAULT_TEXTS, HERO_THEMES, heroBackground, type Notice, type UiTexts } from "@/lib/ui-content-types";

export { DEFAULT_TEXTS, HERO_THEMES, heroBackground };
export type { Notice, UiTexts };

/* ══════════════════════════════════════════════════════════
 *  এডিটেবল UI টেক্সট ও নোটিশ বোর্ড
 *  ─────────────────────────────────────────────────────────
 *  সবকিছু `settings` টেবিলে JSON হিসেবে থাকে (নতুন টেবিল লাগে না):
 *    ui.texts            → গ্লোবাল (প্ল্যাটফর্ম অ্যাডমিন বদলায়, লগইন পেজে দেখায়)
 *    ui.texts:<officeId> → অফিস নির্দিষ্ট (ম্যানেজার বদলায়, গ্লোবালকে ওভাররাইড করে)
 *    ui.notices / ui.notices:<officeId> → স্ক্রলিং নোটিশ বোর্ডের বার্তা
 * ══════════════════════════════════════════════════════════ */

const TEXTS_KEY = "ui.texts";
const NOTICES_KEY = "ui.notices";

const scopeKey = (base: string, officeId: string | null): string => (officeId ? `${base}:${officeId}` : base);

function cleanText(v: unknown, max = 600): string {
  return String(v ?? "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, max);
}

async function readSetting(key: string): Promise<string> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? "";
}

async function writeSetting(key: string, officeId: string | null, value: string): Promise<void> {
  const existing = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).limit(1);
  if (existing[0]) {
    await db.update(settings).set({ value, officeId, updatedAt: new Date() }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value, officeId, updatedAt: new Date() });
  }
}

function parseTexts(raw: string): Partial<UiTexts> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<UiTexts> = {};
    for (const key of Object.keys(DEFAULT_TEXTS) as (keyof UiTexts)[]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === "string") out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** গ্লোবাল টেক্সটের উপরে অফিসের টেক্সট বসিয়ে চূড়ান্ত টেক্সট দেয় */
export async function getTexts(officeId: string | null): Promise<UiTexts> {
  const globalRaw = await readSetting(TEXTS_KEY);
  const merged: UiTexts = { ...DEFAULT_TEXTS };
  // খালি ঘর ডিফল্টেই থাকে — লগইন পেজে ফাঁকা টেক্সট দেখাবে না
  for (const [k, v] of Object.entries(parseTexts(globalRaw))) {
    if (cleanText(v)) merged[k as keyof UiTexts] = v as string;
  }
  if (!officeId) return merged;
  const officeTexts = parseTexts(await readSetting(scopeKey(TEXTS_KEY, officeId)));
  for (const [k, v] of Object.entries(officeTexts)) {
    if (cleanText(v)) merged[k as keyof UiTexts] = v as string;
  }
  return merged;
}

export async function setTexts(officeId: string | null, patch: Partial<UiTexts>): Promise<UiTexts> {
  const current = officeId ? parseTexts(await readSetting(scopeKey(TEXTS_KEY, officeId))) : parseTexts(await readSetting(TEXTS_KEY));
  const next: Partial<UiTexts> = { ...current };
  for (const key of Object.keys(DEFAULT_TEXTS) as (keyof UiTexts)[]) {
    if (patch[key] === undefined) continue;
    if (key === "heroTheme") {
      const t = String(patch.heroTheme ?? "").trim();
      next.heroTheme = HERO_THEMES.some((h) => h.id === t) ? t : "green";
      continue;
    }
    next[key] = cleanText(patch[key], key === "heroFeatures" || key === "heroDescription" ? 1200 : 300);
  }
  await writeSetting(scopeKey(TEXTS_KEY, officeId), officeId, JSON.stringify(next));
  return getTexts(officeId);
}

function parseNotices(raw: string): Notice[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        id: String(x.id ?? cryptoId("ntc")),
        text: cleanText(x.text, 240),
        active: x.active !== false,
        createdAt: String(x.createdAt ?? new Date().toISOString()),
      }))
      .filter((n) => n.text.length > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
}

/** গ্লোবাল + অফিস — দুই স্তরের সক্রিয় নোটিশ একসাথে (গ্লোবাল আগে) */
export async function getNotices(officeId: string | null): Promise<Notice[]> {
  const global = parseNotices(await readSetting(NOTICES_KEY)).filter((n) => n.active);
  if (!officeId) return global;
  const local = parseNotices(await readSetting(scopeKey(NOTICES_KEY, officeId))).filter((n) => n.active);
  return [...global, ...local];
}

/** একটি স্তরের (গ্লোবাল বা অফিস) সব নোটিশ — এডিটরের জন্য, নিষ্ক্রিয়গুলোসহ */
export async function getNoticesForEdit(officeId: string | null): Promise<Notice[]> {
  return parseNotices(await readSetting(scopeKey(NOTICES_KEY, officeId)));
}

export async function setNotices(officeId: string | null, list: Notice[]): Promise<Notice[]> {
  const clean: Notice[] = (Array.isArray(list) ? list : [])
    .map((n) => ({
      id: String(n?.id ?? cryptoId("ntc")),
      text: cleanText(n?.text, 240),
      active: n?.active !== false,
      createdAt: String(n?.createdAt ?? new Date().toISOString()),
    }))
    .filter((n) => n.text.length > 0)
    .slice(0, 20);
  await writeSetting(scopeKey(NOTICES_KEY, officeId), officeId, JSON.stringify(clean));
  return clean;
}

/** লগইন পেজের জন্য পাবলিক কন্টেন্ট (অথেন্টিকেশন লাগে না) */
export async function getPublicContent(): Promise<{ texts: UiTexts; notices: Notice[] }> {
  const [texts, notices] = await Promise.all([getTexts(null), getNotices(null)]);
  return { texts, notices };
}

export function makeNotice(text: string): Notice {
  return { id: cryptoId("ntc"), text: cleanText(text, 240), active: true, createdAt: new Date().toISOString() };
}
