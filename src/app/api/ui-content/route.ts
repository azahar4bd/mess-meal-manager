import { NextResponse } from "next/server";
import { DEFAULT_TEXTS, getPublicContent } from "@/lib/ui-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ui-content — লগইন পেজের এডিটেবল টেক্সট ও গ্লোবাল নোটিশ।
 * অথেন্টিকেশন লাগে না (লগআউট অবস্থায়ও hero টেক্সট দেখাতে হয়)।
 * কখনো থ্রো করে না — ডেটাবেসে সমস্যা হলে ডিফল্ট টেক্সটই ফেরত দেয়।
 */
export async function GET() {
  try {
    const data = await getPublicContent();
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, data: { texts: DEFAULT_TEXTS, notices: [] } });
  }
}
