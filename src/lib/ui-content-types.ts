/** এডিটেবল UI টেক্সট ও নোটিশের টাইপ + ডিফল্ট মান (ক্লায়েন্ট ও সার্ভার — দুই জায়গাতেই নিরাপদে ব্যবহারযোগ্য) */

export interface UiTexts {
  /* ── ব্র্যান্ড / হেডার ── */
  appName: string;
  /** লগইন-পরবর্তী উপরের হেডারে অ্যাপের নাম (খালি রাখলে appName দেখাবে) */
  headerTitle: string;
  /** হেডারে অফিস নামের নিচে কাস্টম ট্যাগলাইন (খালি রাখলে অফিস • শাখা দেখাবে) */
  headerTagline: string;

  /* ── লগইন পেজের Hero ── */
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  /** প্রতি লাইনে একটি ফিচার */
  heroFeatures: string;
  /** Hero প্যানেলের স্টাইল প্রিসেট: green | blue | purple | sunset | dark */
  heroTheme: string;

  /* ── ড্যাশবোর্ড ── */
  dashboardTitle: string;
  /** ড্যাশবোর্ডের নিজের লেখা সাবটাইটেল (খালি রাখলে শুধু অফিস/মাসের তথ্য দেখায়) */
  dashboardSubtitle: string;

  /* ── উপরের স্ক্রলিং নোটিশ বার ── */
  marqueeLabel: string;

  /* ── ফুটার ── */
  footerText: string;
  footerSubText: string;
}

export interface Notice {
  id: string;
  text: string;
  active: boolean;
  createdAt: string;
}

/** Hero থিম প্রিসেট — brand প্যানেলের ব্যাকগ্রাউন্ড */
export const HERO_THEMES: { id: string; label: string; background: string }[] = [
  { id: "green", label: "সবুজ (ডিফল্ট)", background: "linear-gradient(135deg,#0d9488 0%,#0e9469 55%,#059669 100%)" },
  { id: "blue", label: "নীল", background: "linear-gradient(135deg,#1e3a8a 0%,#0284c7 100%)" },
  { id: "purple", label: "বেগুনি", background: "linear-gradient(135deg,#5b21b6 0%,#c026d3 100%)" },
  { id: "sunset", label: "সানসেট", background: "linear-gradient(135deg,#9a3412 0%,#be123c 100%)" },
  { id: "dark", label: "ডার্ক", background: "linear-gradient(135deg,#0f172a 0%,#334155 100%)" },
];

export function heroBackground(theme: string | undefined): string {
  return HERO_THEMES.find((t) => t.id === theme)?.background ?? "";
}

export const DEFAULT_TEXTS: UiTexts = {
  appName: "Mess Meal Manager",
  headerTitle: "",
  headerTagline: "",

  heroBadge: "মাল্টি-অফিস মেস মিল ম্যানেজমেন্ট প্ল্যাটফর্ম",
  heroTitle: "এক অ্যাপ।\nএকাধিক অফিস।\nসম্পূর্ণ আলাদা হিসাব।",
  heroDescription:
    "প্রতিটি অফিসের আলাদা ম্যানেজার, আলাদা সদস্য, আলাদা মাস, আলাদা মিল/বাজার/তহবিল হিসাব এবং আলাদা রিপোর্ট। এক অফিসের তথ্য অন্য অফিস থেকে কেউ দেখতে বা বদলাতে পারবে না।",
  heroFeatures: [
    "একই অ্যাপে একাধিক অফিস / মেস — সম্পূর্ণ আলাদা হিসাব",
    "দৈনিক মিল, বাজার খরচ, স্থায়ী তহবিল ও অন্যান্য আয়",
    "স্বয়ংক্রিয় মিল রেট ও দেনা-পাওনা হিসাব",
    "মাসিক রিপোর্ট — PDF ও CSV এক্সপোর্ট",
    "Google Sheets ফুল সিংক (৮টি ট্যাব)",
    "রোল ভিত্তিক নিরাপত্তা: Admin / Manager / Member / Audit",
  ].join("\n"),
  heroTheme: "green",

  dashboardTitle: "ড্যাশবোর্ড / Dashboard",
  dashboardSubtitle: "",

  marqueeLabel: "📢 নোটিশ",

  footerText: "Mess Meal Manager",
  footerSubText: "v1.0.0 • Multi-Office Platform",
};
