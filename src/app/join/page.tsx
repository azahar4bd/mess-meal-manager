import type { Metadata } from "next";
import { MessApp } from "@/components/MessApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "সদস্য জয়েন — Mess Meal Manager" };

/** `/join` — the same universal interface, opened in Member Join mode. */
export default function JoinPage() {
  return <MessApp />;
}
