import type { Metadata } from "next";
import { MessApp } from "@/components/MessApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "অফিস সাইনআপ — Mess Meal Manager" };

/** `/signup` — the same universal interface, opened in Office Signup mode. */
export default function SignupPage() {
  return <MessApp />;
}
