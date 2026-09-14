/** এডিটেবল UI টেক্সট ও নোটিশের টাইপ + ডিফল্ট মান (ক্লায়েন্ট ও সার্ভার — দুই জায়গাতেই নিরাপদে ব্যবহারযোগ্য) */

export interface UiTexts {
  appName: string;
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  /** প্রতি লাইনে একটি ফিচার */
  heroFeatures: string;
  dashboardTitle: string;
  /** ড্যাশবোর্ডের নিজের লেখা সাবটাইটেল (খালি রাখলে শুধু অফিস/মাসের তথ্য দেখায়) */
  dashboardSubtitle: string;
}

export interface Notice {
  id: string;
  text: string;
  active: boolean;
  createdAt: string;
}

export const DEFAULT_TEXTS: UiTexts = {
  appName: "Mess Meal Manager",
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
  dashboardTitle: "ড্যাশবোর্ড / Dashboard",
  dashboardSubtitle: "",
};
