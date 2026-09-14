"use client";

import React from "react";
import { useApp } from "@/components/app-context";

/**
 * এক লাইনের গাইড-নির্দেশনা। অ্যাপের প্রতিটি স্ক্রিনের বিস্তারিত ব্যাখ্যা এখন "গাইড" ট্যাবে,
 * তাই স্ক্রিনে শুধু এই এক লাইন থাকে — ক্লিক করলে গাইড ট্যাবের ঠিক সেই অংশে নিয়ে যায়।
 */
export function GuideLine({ section, text }: { section?: SectionId; text?: string }) {
  const app = useApp();
  const open = () => {
    if (section) window.location.hash = `g-${section}`;
    app.setTab("guide");
  };
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      <span className="muted">{text ?? "📘 বিস্তারিত নির্দেশনা গাইডে আছে"}</span>
      <button type="button" className="link text-[12px] font-bold" onClick={open}>
        গাইড দেখুন →
      </button>
    </div>
  );
}

export type SectionId =
  | "shuru"
  | "office"
  | "dashboard"
  | "members"
  | "meals"
  | "bazar"
  | "fund"
  | "income"
  | "extras"
  | "rules"
  | "report"
  | "month"
  | "sheet"
  | "admin"
  | "help";
