"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { mess, apiGet, ApiError } from "@/lib/client";
import { can as canRole, menuForRole, ROLE_HOME, type Capability, type MenuItem } from "@/lib/permissions";
import type { Toast, ToastKind } from "@/components/ui";
import { useToasts } from "@/components/ui";
import type { AuthUser, MessData, MonthDTO, MonthSummary, OfficeDTO, Role } from "@/lib/types";

export interface MeResponse {
  authenticated: boolean;
  user: AuthUser;
  office: OfficeDTO | null;
  offices: OfficeDTO[];
  months: MonthDTO[];
  menu: { tab: string; bn: string; en: string; icon: string }[];
  home: string;
  requiresApproval: boolean;
}

export interface Bootstrap {
  office: OfficeDTO;
  months: MonthDTO[];
  month: MonthDTO;
  data: MessData;
  summary: MonthSummary;
  role: Role;
  home: string;
  sync?: { scriptConfigured: boolean; lastSyncedAt: string | null };
}

export interface AppContextValue {
  /* identity */
  user: AuthUser | null;
  role: Role | null;
  menu: MenuItem[];
  requiresApproval: boolean;

  /* office + month */
  office: OfficeDTO | null;
  offices: OfficeDTO[];
  months: MonthDTO[];
  month: MonthDTO | null;
  data: MessData | null;
  summary: MonthSummary | null;

  /* ui state */
  lang: "bn" | "en";
  theme: "light" | "dark";
  tab: string;
  loading: boolean;
  bootError: string | null;
  toasts: Toast[];

  /* actions */
  t: (bn: string, en: string) => string;
  can: (c: Capability) => boolean;
  toast: (message: string, kind?: ToastKind) => void;
  closeToast: (id: number) => void;
  setLang: (l: "bn" | "en") => void;
  toggleTheme: () => void;
  setTab: (tab: string) => void;
  call: <T = unknown>(action: string, payload?: Record<string, unknown>) => Promise<T | null>;
  refresh: () => Promise<void>;
  bootstrap: () => Promise<void>;
  selectMonth: (monthId: string) => Promise<void>;
  /** চালু মাস ক্লোজ করে সঙ্গে সঙ্গে পরের মাস খোলে (রোস্টার + নগদ + জের ক্যারি) */
  closeCurrentMonth: () => Promise<MonthDTO | null>;
  /** অ্যাডমিন: বন্ধ/পুরনো মাস পুনরায় চালু করা */
  reopenMonth: (monthId: string) => Promise<boolean>;
  switchOffice: (officeId: string) => Promise<void>;
  logout: () => Promise<void>;
  signIn: (payload: Record<string, unknown>) => Promise<void>;
  autoSync: boolean;
  setAutoSync: (v: boolean) => void;
  syncBusy: boolean;
  runSync: () => Promise<{ ok: boolean; message: string }>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Members may only read their own report — everyone else gets the raw ledger. */
async function fetchMonthPayload(
  monthId: string,
  role: Role | null,
): Promise<{ month: MonthDTO; data: MessData; summary: MonthSummary }> {
  if (role === "member") {
    const rep = await mess<{ month: MonthDTO; data: MessData; summary: MonthSummary }>("report.summary", { monthId });
    return { month: rep.month, data: rep.data, summary: rep.summary };
  }
  return mess<{ month: MonthDTO; data: MessData; summary: MonthSummary }>("month.data", { monthId });
}

const AUTO_SYNC_KEY = "mmm-auto-sync";
const LANG_KEY = "mmm-lang";
const THEME_KEY = "mmm-theme";

function readStored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [office, setOffice] = useState<OfficeDTO | null>(null);
  const [offices, setOffices] = useState<OfficeDTO[]>([]);
  const [months, setMonths] = useState<MonthDTO[]>([]);
  const [month, setMonth] = useState<MonthDTO | null>(null);
  const [data, setData] = useState<MessData | null>(null);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [tab, setTabState] = useState<string>("dashboard");
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [lang, setLangState] = useState<"bn" | "en">("bn");
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [autoSync, setAutoSyncState] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const { toasts, push, close } = useToasts();
  const bootstrapped = useRef(false);

  const role = user?.role ?? null;
  const menu = useMemo(() => (role ? menuForRole(role) : []), [role]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => push(message, kind), [push]);

  const applyBootstrap = useCallback((b: Bootstrap) => {
    setOffice(b.office);
    setMonths(b.months);
    setMonth(b.month);
    setData(b.data);
    setSummary(b.summary);
    setTabState((current) => {
      const allowed = menuForRole(b.role).map((m) => m.tab);
      if (current && allowed.includes(current)) return current;
      return allowed.includes(b.home) ? b.home : allowed[0] ?? "report";
    });
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setBootError(null);
    try {
      const me = await apiGet<MeResponse>("/auth/me");
      if (!me.authenticated) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(me.user);
      setRequiresApproval(Boolean(me.requiresApproval));
      setOffices(me.offices ?? []);
      setLangState((readStored(LANG_KEY, "bn") as "bn" | "en") ?? "bn");
      const storedTheme = readStored(THEME_KEY, "light") as "light" | "dark";
      setThemeState(storedTheme);
      setAutoSyncState(readStored(AUTO_SYNC_KEY, "0") === "1");

      if (me.user.status === "pending") {
        setLoading(false);
        return;
      }

      if (!me.user.activeOfficeId) {
        setLoading(false);
        setBootError("office-required");
        return;
      }

      // members have no ledger read rights — they get the report payload instead
      if (me.user.role === "member") {
        const b = await mess<Bootstrap>("bootstrap").catch(async (err) => {
          if (err instanceof ApiError && err.status === 403) {
            const rep = await mess<{
              office: OfficeDTO;
              month: MonthDTO;
              summary: MonthSummary;
              data: MessData;
            }>("report.summary");
            const months = await mess<MonthDTO[]>("months.list").catch(() => [rep.month]);
            return {
              office: rep.office,
              months,
              month: rep.month,
              data: rep.data,
              summary: rep.summary,
              role: me.user.role,
              home: "report",
            } as Bootstrap;
          }
          throw err;
        });
        applyBootstrap(b);
        setLoading(false);
        return;
      }

      const b = await mess<Bootstrap>("bootstrap");
      applyBootstrap(b);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError && (err.code === "login-required" || err.status === 401)) {
        setUser(null);
        setBootError(null);
        return;
      }
      if (err instanceof ApiError && err.code === "office-required") {
        setBootError("office-required");
        return;
      }
      setBootError(err instanceof Error ? err.message : "অ্যাপ লোড করা যায়নি");
    }
  }, [applyBootstrap]);

  React.useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    if (!month) {
      await bootstrap();
      return;
    }
    try {
      const res = await fetchMonthPayload(month.id, role);
      setMonth(res.month);
      setData(res.data);
      setSummary(res.summary);
    } catch (err) {
      toast(err instanceof Error ? err.message : "ডেটা রিফ্রেশ করা যায়নি", "error");
    }
  }, [month, role, bootstrap, toast]);

  const call = useCallback(
    async <T,>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> => {
      const body: Record<string, unknown> = { ...payload };
      if (month && body.monthId === undefined) body.monthId = month.id;
      try {
        const result = await mess<T>(action, body);
        const isWrite =
          !action.endsWith(".list") &&
          !action.endsWith(".data") &&
          !action.startsWith("sheet.") &&
          !(action.startsWith("support.") && action !== "support.send" && action !== "support.reply") &&
          action !== "bootstrap";
        if (isWrite) {
          // ডেটা রিফ্রেশ + সার্ভার-সাইড স্বয়ংক্রিয় গুগল শিট সিংক (after()-হুক);
          // ক্লায়েন্ট থেকে আলাদা সিংক কল করা হয় না (ডুপ্লিকেট/পারমিশন এরর এড়াতে)।
          await refresh();
        }
        return result;
      } catch (err) {
        toast(err instanceof Error ? err.message : "কাজটি সম্পন্ন করা যায়নি", "error");
        return null;
      }
    },
    [month, refresh, toast],
  );

  const selectMonth = useCallback(
    async (monthId: string) => {
      setLoading(true);
      try {
        const res = await mess<{ month: MonthDTO; data: MessData; summary: MonthSummary }>("month.data", { monthId });
        setMonth(res.month);
        setData(res.data);
        setSummary(res.summary);
      } catch (err) {
        toast(err instanceof Error ? err.message : "মাস লোড করা যায়নি", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const closeCurrentMonth = useCallback(async () => {
    const current = month;
    if (!current) return null;
    if (current.isClosed) {
      toast("এই মাসটি আগেই বন্ধ — উপরের তালিকা থেকে চালু মাস বেছে নিন", "info");
      return null;
    }
    const res = await call<{
      nextMonth: MonthDTO;
      copiedMembers: number;
      carriedBalances: number;
      carriedDues: number;
      lastBalance: number;
    }>("month.closeAndOpen", { monthId: current.id });
    if (!res) return null;
    toast(
      `${current.monthName} ক্লোজ হয়েছে — নতুন মাস ${res.nextMonth.monthName} শুরু হয়েছে (${res.copiedMembers} জন সদস্য • নগদ ক্যারি ৳${res.lastBalance}${
        res.carriedDues ? ` • ${res.carriedDues} জনের জের` : ""
      }${res.carriedBalances ? ` • ${res.carriedBalances} জনের পাওনা` : ""})`,
      "success",
    );
    const monthsList = await mess<MonthDTO[]>("months.list").catch(() => null);
    if (monthsList) setMonths(monthsList);
    await selectMonth(res.nextMonth.id);
    return res.nextMonth;
  }, [call, toast, selectMonth, month]);

  const reopenMonth = useCallback(
    async (monthId: string) => {
      const m = await call<MonthDTO>("month.reopen", { monthId });
      if (!m) return false;
      toast(`${m.monthName} মাস পুনরায় চালু হয়েছে`, "success");
      const monthsList = await mess<MonthDTO[]>("months.list").catch(() => null);
      if (monthsList) setMonths(monthsList);
      await selectMonth(monthId);
      return true;
    },
    [call, toast, selectMonth],
  );

  const switchOffice = useCallback(
    async (officeId: string) => {
      setLoading(true);
      try {
        const res = await mess<{ office: OfficeDTO; month: MonthDTO; months: MonthDTO[]; data: MessData; summary: MonthSummary }>(
          "office.switch",
          { officeId },
        );
        setOffice(res.office);
        setMonth(res.month);
        setMonths(res.months);
        setData(res.data);
        setSummary(res.summary);
        setUser((u) => (u ? { ...u, activeOfficeId: officeId } : u));
        toast(`অফিস পরিবর্তন: ${res.office.name}`, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "অফিস পরিবর্তন করা যায়নি", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally {
      setUser(null);
      setOffice(null);
      setMonths([]);
      setMonth(null);
      setData(null);
      setSummary(null);
      setRequiresApproval(false);
      setTabState("dashboard");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const signIn = useCallback(
    async (payload: Record<string, unknown>) => {
      bootstrapped.current = true;
      await bootstrap();
      void payload;
    },
    [bootstrap],
  );

  const runSync = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (!month) return { ok: false, message: "কোনো মাস নির্বাচিত নেই" };
    setSyncBusy(true);
    try {
      const res = await mess<{ ok: boolean; message: string; sheetUrl: string; syncedAt: string | null }>("sheet.sync", {
        monthId: month.id,
      });
      if (res?.ok) {
        toast("Sync successful ✓ Google Sheet হালনাগাদ হয়েছে", "success");
        return { ok: true, message: res.message || "Sync successful" };
      }
      const msg = res?.message ?? "Sync failed";
      toast(`Sync failed: ${msg}`, "error");
      return { ok: false, message: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast(`Sync failed: ${msg}`, "error");
      return { ok: false, message: msg };
    } finally {
      setSyncBusy(false);
    }
  }, [month, toast]);

  const setLang = useCallback((l: "bn" | "en") => {
    setLangState(l);
    writeStored(LANG_KEY, l);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      writeStored(THEME_KEY, next);
      if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  const setTab = useCallback((next: string) => {
    setTabState(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const setAutoSync = useCallback((v: boolean) => {
    setAutoSyncState(v);
    writeStored(AUTO_SYNC_KEY, v ? "1" : "0");
  }, []);

  const t = useCallback(
    (bn: string, en: string) => (lang === "bn" ? bn : en),
    [lang],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      role,
      menu,
      requiresApproval,
      office,
      offices,
      months,
      month,
      data,
      summary,
      lang,
      theme,
      tab,
      loading,
      bootError,
      toasts,
      t,
      can: (c: Capability) => canRole(role, c),
      toast,
      closeToast: close,
      setLang,
      toggleTheme,
      setTab,
      call,
      refresh,
      bootstrap,
      selectMonth,
      closeCurrentMonth,
      reopenMonth,
      switchOffice,
      logout,
      signIn,
      autoSync,
      setAutoSync,
      syncBusy,
      runSync,
    }),
    [
      user, role, menu, requiresApproval, office, offices, months, month, data, summary, lang, theme, tab,
      loading, bootError, toasts, t, toast, close, setLang, toggleTheme, setTab, call, refresh, bootstrap,
      selectMonth, closeCurrentMonth, reopenMonth, switchOffice, logout, signIn, autoSync, setAutoSync,
      syncBusy, runSync,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export { ROLE_HOME };
