"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppProvider, useApp } from "@/components/app-context";
import { GuideLine } from "@/components/GuideLine";
import { AppNoticeTicker, GlobalEditButton, useUiContent } from "@/components/UiContent";
import { SupportChatButton } from "@/components/SupportChat";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Loader,
  Select,
  ToastStack,
} from "@/components/ui";
import { AuthScreen } from "@/components/views/AuthScreen";
import { GuideView } from "@/components/views/GuideView";
import { DashboardView } from "@/components/views/DashboardView";
import { MealsView } from "@/components/views/MealsView";
import { BazarView } from "@/components/views/BazarView";
import { FundView } from "@/components/views/FundView";
import { IncomeView } from "@/components/views/IncomeView";
import { ExtrasView } from "@/components/views/ExtrasView";
import { MembersView } from "@/components/views/MembersView";
import { ReportView } from "@/components/views/ReportView";
import { SheetView } from "@/components/views/SheetView";
import { AdminView } from "@/components/views/AdminView";
import { AdminChatButton } from "@/components/views/AdminMessages";
import { mess as messCall } from "@/lib/client";
import { MENU, ROLE_LABEL } from "@/lib/permissions";

/* ══════════════════════════════════════════════════════════
 *  MessApp — the single central component (spec §102)
 *  manages auth · office · month · tabs · menu · theme · lang
 * ══════════════════════════════════════════════════════════ */

export function MessApp({ initialTab }: { initialTab?: string }) {
  return (
    <AppProvider>
      <Shell initialTab={initialTab} />
    </AppProvider>
  );
}

function Shell({ initialTab }: { initialTab?: string }) {
  const app = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (initialTab && app.menu.some((m) => m.tab === initialTab)) app.setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, app.menu.length]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", app.theme === "dark");
  }, [app.theme]);

  // অ্যাডমিনের হাতে একটাও অফিস না থাকলে তাকে সরাসরি অ্যাডমিন প্যানেলে রাখো — অন্য ট্যাবে
  // দেখার মতো কোনো ডেটা নেই, আর অফিস তৈরি করার একমাত্র জায়গা ওই প্যানেলই।
  useEffect(() => {
    if (app.user?.role === "admin" && !app.office && app.offices.length === 0 && app.tab !== "admin") {
      app.setTab("admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.user?.role, app.office, app.offices.length]);

  if (app.loading && !app.user) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl p-4">
          <Loader label="Loading office…" />
        </div>
      </div>
    );
  }

  if (!app.user) {
    return (
      <>
        <AuthScreen initialMode="login" />
        <ToastStack toasts={app.toasts} onClose={app.closeToast} />
      </>
    );
  }

  if (app.requiresApproval) {
    return (
      <>
        <PendingApprovalScreen />
        <ToastStack toasts={app.toasts} onClose={app.closeToast} />
      </>
    );
  }

  // আগে এখানে অ্যাডমিনও আটকে যেত: কোনো অফিস না থাকলে SelectOfficeScreen দেখাত, সেই স্ক্রিন
  // "/signup"-এ পাঠাত, কিন্তু লগইন থাকায় /signup আবার এই স্ক্রিনেই ফিরিয়ে আনত — ফলে প্রথম অফিস
  // তৈরির কোনো পথই খোলা থাকত না (chicken-and-egg)। এখন একটাও অফিস না থাকলে অ্যাডমিন সরাসরি
  // অ্যাডমিন প্যানেলে ঢুকতে পারে; অফিস থাকলে কিন্তু নির্বাচিত না হলে আগের মতো পিকারই দেখাবে।
  const adminWithoutAnyOffice = app.user.role === "admin" && !app.office && app.offices.length === 0;
  if (!adminWithoutAnyOffice && (app.bootError === "office-required" || (!app.office && app.user.role === "admin"))) {
    return (
      <>
        <SelectOfficeScreen />
        <ToastStack toasts={app.toasts} onClose={app.closeToast} />
      </>
    );
  }

  if (app.bootError) {
    return (
      <div className="min-h-screen p-4">
        <ErrorState message={app.bootError} onReload={() => void app.bootstrap()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <AppNoticeTicker />
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <ContextBar />
      <CurrentPageBar />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-4">
        {app.user.role === "admin" && !app.office ? <NoOfficeNotice /> : null}
        <TabRouter />
      </main>
      <FooterBar />
      <MobileTabBar />
      <GlobalEditButton />
      <SupportChatButton />
      <AdminChatButton />
      <ToastStack toasts={app.toasts} onClose={app.closeToast} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Footer — এডিটেবল (UiContentEditor → ফুটার)
 * ══════════════════════════════════════════════════════════ */

function FooterBar() {
  const app = useApp();
  const { texts } = useUiContent(app.office?.id ?? null);
  const main = texts.footerText?.trim() || texts.appName || "Mess Meal Manager";
  const sub = texts.footerSubText?.trim() || "";
  return (
    <footer className="mx-auto mt-6 w-full max-w-6xl px-3 pb-24 text-center no-print sm:px-4 sm:pb-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="text-[12.5px] font-extrabold">{main}</div>
        {sub ? <div className="muted mt-0.5 text-[11px]">{sub}</div> : null}
      </div>
    </footer>
  );
}

/** কোনো অফিসই তৈরি হয়নি — অ্যাডমিনকে কী করতে হবে স্পষ্ট করে বলা */
function NoOfficeNotice() {
  return (
    <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--brand-soft)] p-3">
      <div className="text-[13px] font-bold">এখনো কোনো অফিস তৈরি হয়নি — অ্যাডমিন প্যানেলের “অফিস” ট্যাব থেকে তৈরি করুন।</div>
    </div>
  );
}

function TabRouter() {
  const app = useApp();
  const tab = app.tab;

  // অফিস ছাড়া ডেটা-ট্যাবগুলোতে দেখার মতো কিছু নেই — অ্যাডমিন প্যানেল ছাড়া সব ট্যাবে পরিষ্কার বার্তা
  if (!app.office && tab !== "admin") {
    return (
      <EmptyState
        title="কোনো অফিস নির্বাচিত নেই"
        hint="অ্যাডমিন প্যানেল → অফিস ট্যাব"
      />
    );
  }

  if (!app.can("report.view") && !app.can("meals.view")) {
    return <EmptyState title="আপনার কোনো ট্যাবে প্রবেশাধিকার নেই" hint="ম্যানেজার বা অ্যাডমিনের সঙ্গে যোগাযোগ করুন।" />;
  }

  switch (tab) {
    case "guide":
      return <GuideView />;
    case "dashboard":
      return app.can("dashboard.view") ? <DashboardView /> : <NoAccess />;
    case "meals":
      return <MealsView />;
    case "bazar":
      return <BazarView />;
    case "fund":
      return <FundView />;
    case "income":
      return <IncomeView />;
    case "extras":
      return <ExtrasView />;
    case "members":
      return <MembersView />;
    case "report":
      return <ReportView />;
    case "sheet":
      return <SheetView />;
    case "admin":
      return <AdminView />;
    default:
      return <DashboardView />;
  }
}

function NoAccess() {
  return <EmptyState icon="🔒" title="এই অংশে প্রবেশাধিকার নেই" hint="আপনার রোলের অনুমতি অনুযায়ী অন্য মেনু ব্যবহার করুন।" />;
}

/* ══════════════════════════════════════════════════════════
 *  Header (spec §67, §71)
 * ══════════════════════════════════════════════════════════ */

function Header({ menuOpen, setMenuOpen }: { menuOpen: boolean; setMenuOpen: (v: boolean) => void }) {
  const app = useApp();
  const { texts } = useUiContent(app.office?.id ?? null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const roleLabel = app.role ? ROLE_LABEL[app.role] : null;
  const brandTitle = texts.headerTitle?.trim() || texts.appName || "Mess Meal Manager";
  const brandInitial = brandTitle.trim().charAt(0).toUpperCase() || "M";
  const defaultTagline = `${app.office?.name ?? "—"}${app.office?.branch ? ` • ${app.office.branch}` : ""}`;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur no-print">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="btn btn-ghost btn-sm h-10 w-10 px-0 text-[19px]"
          aria-label="☰ মেনু"
          aria-expanded={menuOpen}
        >
          ☰
        </button>

        <button type="button" onClick={() => app.setTab(app.can("dashboard.view") ? "dashboard" : "report")} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[16px] font-black text-white shadow-sm"
            style={{ background: "linear-gradient(135deg,#0d9488 0%,var(--brand) 55%,#059669 100%)" }}
          >
            {brandInitial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-extrabold leading-tight">{brandTitle}</span>
            <span className="muted block truncate text-[11px] leading-tight">
              {texts.headerTagline?.trim() || defaultTagline}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => app.setLang(app.lang === "bn" ? "en" : "bn")}
            className="btn btn-ghost btn-sm h-10 px-2 text-[12px]"
            title="ভাষা পরিবর্তন / Language"
          >
            {app.lang === "bn" ? "বাং" : "EN"}
          </button>
          <button
            type="button"
            onClick={app.toggleTheme}
            className="btn btn-ghost btn-sm h-10 w-10 px-0 text-[15px]"
            title="ডার্ক / লাইট মোড"
            aria-label="থিম পরিবর্তন"
          >
            {app.theme === "dark" ? "☀" : "☾"}
          </button>
          <button type="button" onClick={() => setLogoutOpen(true)} className="btn btn-ghost btn-sm h-10 gap-1.5 px-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--brand-soft)] text-[11px] font-bold text-[var(--brand)]">
              {(app.user?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[110px] truncate sm:block">
              <span className="block truncate text-[12.5px] font-bold leading-tight">{app.user?.name}</span>
              <span className="muted block text-[10.5px] leading-tight">{roleLabel ? (app.lang === "bn" ? roleLabel.bn : roleLabel.en) : ""}</span>
            </span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="লগআউট করবেন?"
        message="আপনি লগআউট করতে চলেছেন। সংরক্ষিত সব হিসাব ডেটাবেসে থাকবে।"
        confirmLabel="Logout"
        cancelLabel="Cancel"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={async () => {
          setLogoutOpen(false);
          await app.logout();
        }}
      />
    </header>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Context bar — office + month (spec §71, §95)
 * ══════════════════════════════════════════════════════════ */

function ContextBar() {
  const app = useApp();
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const monthOptions = useMemo(() => {
    const list = app.months.map((m) => ({ id: m.id, label: `${m.isClosed ? "🔒 " : ""}${m.monthName}${m.isClosed ? " (বন্ধ)" : ""}` }));
    return list.length ? list : app.month ? [{ id: app.month.id, label: app.month.monthName }] : [];
  }, [app.months, app.month]);

  return (
    <div className="border-b border-[var(--border)] bg-[var(--brand-soft)]/60 no-print">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        {app.user?.canSwitchOffice ? (
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
            <span className="muted shrink-0 font-semibold">অফিস:</span>
            <Select
              className="input input-sm h-9 min-w-0 flex-1"
              value={app.office?.id ?? ""}
              onChange={(e) => void app.switchOffice(e.target.value)}
            >
              {(app.offices.length ? app.offices : app.office ? [app.office] : []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.branch ? ` (${o.branch})` : ""} — {o.code}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <span className="muted font-semibold">অফিস:</span>
            <span className="truncate font-bold">{app.office?.name ?? "—"}</span>
            {app.office?.code ? <Badge tone="brand">{app.office.code}</Badge> : null}
          </div>
        )}

        <label className="flex min-w-0 items-center gap-1.5 text-[12px] sm:ml-auto">
          <span className="muted shrink-0 font-semibold">মাস:</span>
          <Select
            className="input input-sm h-9 min-w-0"
            value={app.month?.id ?? ""}
            onChange={(e) => void app.selectMonth(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            {monthOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </label>

        {app.can("month.write") && app.month && !app.month.isClosed ? (
          <button
            type="button"
            className="btn btn-soft btn-sm h-9 border-[var(--warn)] text-[var(--warn)]"
            onClick={() => setCloseOpen(true)}
            title="চালু মাস বন্ধ করলে সঙ্গে সঙ্গে পরের মাস স্বয়ংক্রিয় শুরু হবে"
          >
            🔒 চালু মাস ক্লোজ
          </button>
        ) : null}

        {app.can("office.manage") && app.month?.isClosed ? (
          <button
            type="button"
            className="btn btn-soft btn-sm h-9 border-[var(--brand)] text-[var(--brand)]"
            onClick={() => setReopenOpen(true)}
            title="পুরনো/বন্ধ মাস পুনরায় চালু করুন (সংশোধনের পর আবার ক্লোজ করা যাবে)"
          >
            🔓 মাস চালু করুন
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={closeOpen}
        busy={closing}
        title="চালু মাস ক্লোজ করবেন?"
        message={`${app.month?.monthName ?? ""} মাস বন্ধ হলেই সঙ্গে সঙ্গে পরের মাস খুলে যাবে — সক্রিয় সদস্য, প্রত্যেকের স্থায়ী ফান্ড (মূল টাকা অপরিবর্তিত কপি হবে), চূড়ান্ত দেনা-বকেয়া (জের) ও পাওনা স্বয়ংক্রিয় ক্যারি হবে। বন্ধ মাসের পুরনো হিসাব অপরিবর্তিত থাকবে (প্রয়োজনে শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিন পুনরায় চালু করতে পারবেন)।`}
        confirmLabel="হ্যাঁ, ক্লোজ করে পরের মাস খুলুন"
        cancelLabel="বাতিল"
        onCancel={() => setCloseOpen(false)}
        onConfirm={async () => {
          setClosing(true);
          const next = await app.closeCurrentMonth();
          setClosing(false);
          if (next) setCloseOpen(false);
        }}
      />

      <ConfirmDialog
        open={reopenOpen}
        busy={reopening}
        title="বন্ধ মাস পুনরায় চালু করবেন?"
        message={`${app.month?.monthName ?? ""} মাস চালু করা হলে সংশোধন করতে পারবেন। পরের মাসে তখনো কোনো এন্ট্রি না পড়লে সংশোধন শেষে আবার ক্লোজ করার সময় জের/নগদ নতুন হিসাবে নিখুঁতভাবে বসবে; পরের মাসে এন্ট্রি পড়ে গেলে তা ছোঁয়া হবে না।`}
        confirmLabel="হ্যাঁ, মাস চালু করুন"
        cancelLabel="বাতিল"
        onCancel={() => setReopenOpen(false)}
        onConfirm={async () => {
          if (!app.month) return;
          setReopening(true);
          const ok = await app.reopenMonth(app.month.id);
          setReopening(false);
          if (ok) setReopenOpen(false);
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Current page indicator — যে পেজে আছেন উপরে সেই পেজের নাম
 * ══════════════════════════════════════════════════════════ */

function CurrentPageBar() {
  const app = useApp();
  const current = MENU.find((m) => m.tab === app.tab) ?? app.menu.find((m) => m.tab === app.tab);
  if (!current) return null;
  const label = app.lang === "bn" ? current.bn : current.en;
  return (
    <div className="border-b border-[var(--border)] bg-[var(--card)] no-print">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-1.5 px-3 py-1.5 sm:px-4">
        <span aria-hidden className="shrink-0 text-[14px]">
          {current.icon}
        </span>
        <span className="truncate text-[13.5px] font-extrabold text-[var(--brand)]">{label}</span>
        {app.month ? <span className="muted ml-auto shrink-0 text-[11.5px] font-semibold">{app.month.monthName}</span> : null}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Sidebar menu — role based (spec §68–§70)
 * ══════════════════════════════════════════════════════════ */

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const { texts } = useUiContent(app.office?.id ?? null);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 no-print">
      <button type="button" aria-label="মেনু বন্ধ করুন" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <aside className="slide-in absolute inset-y-0 left-0 flex w-[86%] max-w-[300px] flex-col border-r border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
          <div className="text-[14px] font-extrabold">☰ Menu</div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm h-9 w-9 px-0 text-[17px]" aria-label="বন্ধ করুন">
            ×
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-3 py-2.5 text-[12px]">
          <div className="truncate font-bold">{app.user?.name}</div>
          <div className="muted truncate">
            {app.user?.userId} • {app.role ? ROLE_LABEL[app.role].bn : ""}
          </div>
          <div className="muted mt-1 truncate">
            {app.office?.name} {app.month ? `• ${app.month.monthName}` : ""}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {app.menu.map((m) => (
            <button
              key={m.tab}
              type="button"
              onClick={() => {
                app.setTab(m.tab);
                onClose();
              }}
              className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-semibold transition ${
                app.tab === m.tab ? "bg-[var(--brand)] text-white" : "hover:bg-[var(--brand-soft)]"
              }`}
            >
              <span className="w-5 text-center" aria-hidden>
                {m.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{app.lang === "bn" ? m.bn : m.en}</span>
              {app.tab === m.tab ? <span aria-hidden>›</span> : null}
            </button>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-2">
          <button
            type="button"
            onClick={() => void app.logout()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            <span className="w-5 text-center" aria-hidden>
              ⎋
            </span>
            Logout
          </button>
          <p className="px-3 pt-1 text-[11px] font-bold">{texts.footerText?.trim() || texts.appName || "Mess Meal Manager"}</p>
          {texts.footerSubText?.trim() ? <p className="muted px-3 text-[10.5px]">{texts.footerSubText}</p> : null}
        </div>
      </aside>
    </div>
  );
}

/** Bottom quick-nav on small screens (mobile UX, spec §105) */
function MobileTabBar() {
  const app = useApp();
  // প্রতিদিনের কাজের ট্যাব + রিপোর্ট আগে রাখা হয়; বাকিগুলো ☰ মেনুতে
  const PRIORITY = ["dashboard", "meals", "bazar", "fund", "report"];
  const items = PRIORITY.map((t) => app.menu.find((m) => m.tab === t)).filter((m): m is NonNullable<typeof m> => Boolean(m)).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--border)] bg-[var(--card)]/98 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden no-print" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((m) => {
        const active = app.tab === m.tab;
        return (
          <button
            key={m.tab}
            type="button"
            onClick={() => app.setTab(m.tab)}
            className={`flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition ${
              active ? "text-[var(--brand)]" : "text-[var(--muted)]"
            }`}
          >
            <span className={`grid h-7 w-10 place-items-center rounded-full text-[16px] ${active ? "bg-[var(--brand-soft)]" : ""}`} aria-hidden>
              {m.icon}
            </span>
            <span className="max-w-full truncate">{app.lang === "bn" ? m.bn.split(" ")[0] : m.en}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ══════════════════════════════════════════════════════════
 *  special screens
 * ══════════════════════════════════════════════════════════ */

function PendingApprovalScreen() {
  const app = useApp();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <div className="text-[38px]" aria-hidden>
          ⏳
        </div>
        <h1 className="mt-2 text-[18px] font-extrabold">অনুমোদনের অপেক্ষায়</h1>
        <p className="muted mt-2 text-[13px]">অনুরোধ জমা হয়েছে — ম্যানেজার/অ্যাডমিন অনুমোদন করলে হিসাব দেখতে পাবেন।</p>
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-left text-[12.5px]">
          <div className="flex justify-between gap-2 py-0.5">
            <span className="muted">User ID</span>
            <span className="font-bold">{app.user?.userId}</span>
          </div>
          <div className="flex justify-between gap-2 py-0.5">
            <span className="muted">অফিস</span>
            <span className="font-bold">{app.user?.officeId ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2 py-0.5">
            <span className="muted">স্ট্যাটাস</span>
            <Badge tone="warn">pending</Badge>
          </div>
        </div>
        <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => void app.logout()}>
          Logout
        </button>
      </div>
    </div>
  );
}

function SelectOfficeScreen() {
  const app = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [offices, setOffices] = useState<{ id: string; name: string; branch: string; code: string; status: string }[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoadingOffices(true);
    messCall<{ id: string; name: string; branch: string; code: string; status: string }[]>("admin.offices.list")
      .then((list) => {
        if (alive) setOffices(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setOffices([]);
      })
      .finally(() => {
        if (alive) setLoadingOffices(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-lg p-5">
        <h1 className="text-[18px] font-extrabold">অফিস নির্বাচন করুন</h1>
        <p className="muted mt-1 text-[12.5px]">অ্যাডমিন হিসেবে লগইন — যে অফিস দেখতে চান বেছে নিন।</p>

        <div className="mt-4 space-y-2">
          {loadingOffices ? <Loader label="Loading offices…" /> : null}
          {!loadingOffices && offices.length === 0 ? (
            <EmptyState title="কোনো অফিস পাওয়া যায়নি" hint="নতুন অফিস তৈরি করতে নিচের বাটন ব্যবহার করুন।" />
          ) : null}
          {offices.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(o.id);
                await app.switchOffice(o.id);
                await app.bootstrap();
                setBusy(null);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{o.name}</span>
                <span className="muted block truncate text-[11.5px]">
                  {o.branch || "—"} • {o.code} • <code>{o.id}</code>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge tone={o.status === "active" ? "ok" : "warn"}>{o.status}</Badge>
                {busy === o.id ? <span className="text-[12px]">…</span> : <span aria-hidden>›</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => setReloadKey((k) => k + 1)}>
            রিফ্রেশ
          </button>
          <a className="btn btn-soft flex-1" href="/signup">
            + নতুন অফিস তৈরি
          </a>
          <button type="button" className="btn btn-danger flex-1" onClick={() => void app.logout()}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
