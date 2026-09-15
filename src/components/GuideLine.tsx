"use client";

import React from "react";

/**
 * স্ক্রিন-লেভেল বর্ণনামূলক লাইন সরিয়ে দেওয়া হয়েছে — ইন্টারফেস নিট ও ক্লিন রাখতে।
 * গাইডের সব তথ্য “গাইড” ট্যাবে আছে; কম্পোনেন্টটি কলসাইট অপরিবর্তিত রাখতে খালি রেন্ডার করে।
 */
export function GuideLine(_props: { section?: SectionId; text?: string }) {
  void _props;
  return null;
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
