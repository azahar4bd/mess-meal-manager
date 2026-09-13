import { MessApp } from "@/components/MessApp";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/` — the universal app URL (spec §4).
 *   /?auth=login | signup | join  → the same interface in that auth mode
 *   /?tab=meals                   → deep link straight into a tab
 *   / (no params)                 → role-based home page
 */
export default async function HomePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const tabRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab = typeof tabRaw === "string" && tabRaw.length > 0 ? tabRaw : undefined;

  return <MessApp initialTab={tab} />;
}
