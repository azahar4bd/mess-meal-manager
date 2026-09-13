import type { Metadata } from "next";
import { MessApp } from "@/components/MessApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "লগইন — Mess Meal Manager" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const tabRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  return <MessApp initialTab={typeof tabRaw === "string" ? tabRaw : undefined} />;
}
