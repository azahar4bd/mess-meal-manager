"use client";

import React, { useEffect, useState } from "react";
import { apiPost, ApiError } from "@/lib/client";
import { Field, TextInput, Badge } from "@/components/ui";
import { useApp } from "@/components/app-context";
import { NoticeTicker } from "@/components/UiContent";
import { DEFAULT_TEXTS, type Notice, type UiTexts } from "@/lib/ui-content-types";
import type { Role } from "@/lib/types";

export type AuthMode = "login" | "signup" | "join";

interface LoginResult {
  user: { id: string; name: string; role: Role; status: string; userId: string };
  office: { id: string; name: string; code: string } | null;
  home: string;
  requiresApproval: boolean;
  message?: string;
}

interface SignupResult extends LoginResult {
  officeCode: string;
  message?: string;
}

interface JoinResult {
  user: { id: string; name: string; role: Role; status: string };
  office: { id: string; name: string; code: string };
  pendingApproval: boolean;
  message?: string;
}



export function AuthScreen({
  initialMode = "login",
  onSignedIn,
}: {
  initialMode?: AuthMode;
  onSignedIn?: (payload: Record<string, unknown>) => Promise<void> | void;
}) {
  const app = useApp();
  const onToast = (message: string, kind: "success" | "error" | "info" = "info") => app.toast(message, kind);
  const handleSignedIn = async (payload: Record<string, unknown>) => {
    if (onSignedIn) await onSignedIn(payload);
    else await app.signIn(payload);
  };
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [health, setHealth] = useState<{ ok: boolean; db: boolean; message: string } | null>(null);
  const [ui, setUi] = useState<{ texts: UiTexts; notices: Notice[] } | null>(null);

  useEffect(() => {
    // the URL decides the mode: /login, /signup, /join or /?auth=…
    try {
      const path = window.location.pathname.replace(/\/+$/, "");
      const authParam = new URLSearchParams(window.location.search).get("auth");
      const next = (authParam ?? (path === "/signup" || path === "/join" || path === "/login" ? path.slice(1) : null)) as AuthMode | null;
      if (next === "login" || next === "signup" || next === "join") setMode(next);
      else setMode(initialMode);
    } catch {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; database?: { ok?: boolean }; error?: string }) => {
        if (!alive) return;
        setHealth({
          ok: Boolean(j.ok),
          db: Boolean(j.database?.ok),
          message: j.ok ? "সিস্টেম ঠিক আছে" : "ডেটাবেস সংযোগ পাওয়া যাচ্ছে না",
        });
      })
      .catch(() => alive && setHealth({ ok: false, db: false, message: "সার্ভারে পৌঁছানো যায়নি" }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/ui-content", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: { texts?: UiTexts; notices?: Notice[] } }) => {
        if (alive && j?.data?.texts) setUi({ texts: { ...DEFAULT_TEXTS, ...j.data.texts }, notices: j.data.notices ?? [] });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const texts = ui?.texts ?? DEFAULT_TEXTS;
  const notices = ui?.notices ?? [];
  const heroFeatures = (texts.heroFeatures || "").split("\n").map((x) => x.trim()).filter(Boolean);

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setErrors({});
    setFormError("");
    try {
      window.history.replaceState({}, "", m === "login" ? "/" : `/${m}`);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <NoticeTicker notices={notices} />
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-stretch gap-0 lg:grid-cols-[1.05fr_1fr]">
        {/* ── brand panel ─────────────────────────────── */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--brand)] p-8 text-white lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-black/10"
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-[22px] font-black">M</span>
              <div>
                <div className="text-[20px] font-extrabold leading-tight">{texts.appName}</div>
                <div className="text-[12.5px] text-white/80">{texts.heroBadge}</div>
              </div>
            </div>

            <h1 className="mt-10 whitespace-pre-line text-[27px] font-extrabold leading-snug">{texts.heroTitle}</h1>
            <p className="mt-3 max-w-md text-[13.5px] text-white/85">{texts.heroDescription}</p>

            <ul className="mt-7 space-y-2.5">
              {heroFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] text-white/92">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20 text-[11px]">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-8 text-[11.5px] text-white/75">
            <div className="rounded-lg bg-black/15 p-3">
              <strong className="text-white">অপরিবর্তনীয় নিয়ম:</strong> স্থায়ী ফান্ড মিল খরচ থেকে বাদ যাবে না • মিল রেট =
              (বাজার − অন্য আয়) ÷ মোট মিল • শেয়ার্ড অতিরিক্ত সক্রিয় সদস্যদের মধ্যে ভাগ হবে।
            </div>
          </div>
        </aside>

        {/* ── form panel ──────────────────────────────── */}
        <main className="flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md">
            <div className="mb-4 flex items-center justify-between gap-2 lg:hidden">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-[17px] font-black text-white">M</span>
                <div>
                  <div className="text-[15px] font-extrabold leading-tight">{texts.appName}</div>
                  <div className="muted text-[11px]">{texts.heroBadge}</div>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="grid grid-cols-3 border-b border-[var(--border)] text-[12.5px] font-bold">
                {(
                  [
                    { id: "login", bn: "লগইন", en: "Login" },
                    { id: "signup", bn: "অফিস সাইনআপ", en: "Office Signup" },
                    { id: "join", bn: "সদস্য জয়েন", en: "Member Join" },
                  ] as { id: AuthMode; bn: string; en: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => switchMode(item.id)}
                    className={`px-2 py-3 transition ${
                      mode === item.id ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "muted hover:bg-[var(--bg)]"
                    }`}
                  >
                    {item.bn}
                    <span className="muted block text-[10px] font-semibold">{item.en}</span>
                  </button>
                ))}
              </div>

              <div className="p-4 sm:p-5">
                {formError ? (
                  <div className="mb-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--danger)]">
                    ⚠ {formError}
                  </div>
                ) : null}

                {mode === "login" ? <LoginForm busy={busy} setBusy={setBusy} errors={errors} setErrors={setErrors} setFormError={setFormError} onSignedIn={handleSignedIn} onToast={onToast} /> : null}
                {mode === "signup" ? <SignupForm busy={busy} setBusy={setBusy} errors={errors} setErrors={setErrors} setFormError={setFormError} onSignedIn={handleSignedIn} onToast={onToast} /> : null}
                {mode === "join" ? <JoinForm busy={busy} setBusy={setBusy} errors={errors} setErrors={setErrors} setFormError={setFormError} onSignedIn={handleSignedIn} onToast={onToast} /> : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11.5px]">
              {health ? (
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone={health.ok ? "ok" : "danger"}>{health.ok ? "● Database online" : "● Database offline"}</Badge>
                  <span className="muted">{health.message}</span>
                </span>
              ) : (
                <span className="muted">সিস্টেম স্ট্যাটাস চেক হচ্ছে…</span>
              )}
            </div>

            <p className="muted mt-3 text-center text-[11px]">© {new Date().getFullYear()} {texts.appName}</p>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  LOGIN
 * ══════════════════════════════════════════════════════════ */

interface FormProps {
  busy: boolean;
  setBusy: (v: boolean) => void;
  errors: Record<string, string>;
  setErrors: (v: Record<string, string>) => void;
  setFormError: (v: string) => void;
  onSignedIn: (payload: Record<string, unknown>) => Promise<void> | void;
  onToast?: (message: string, kind?: "success" | "error" | "info") => void;
}

function LoginForm({ busy, setBusy, errors, setErrors, setFormError, onSignedIn, onToast }: FormProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setBusy(true);
    try {
      const res = await apiPost<LoginResult>("/auth/login", { login, password });
      onToast?.(`স্বাগতম, ${res.user.name}!`, "success");
      if (res.message) onToast?.(res.message, "info");
      await onSignedIn(res as unknown as Record<string, unknown>);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError("লগইন করা যায়নি");
      }
    } finally {
      setBusy(false);
    }
  };

  const fill = (u: string, p: string) => {
    setLogin(u);
    setPassword(p);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h2 className="text-[17px] font-extrabold">লগইন করুন</h2>
      </div>

      <Field label="User ID / মোবাইল নম্বর" required error={errors.login}>
        <TextInput
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="01700000000"
          autoComplete="username"
          inputMode="text"
          autoFocus
        />
      </Field>

      <Field label="পাসওয়ার্ড" required error={errors.password}>
        <div className="relative">
          <TextInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPass ? "text" : "password"}
            placeholder="••••••"
            autoComplete="current-password"
            className="pr-16"
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-[11.5px] font-bold muted hover:bg-[var(--brand-soft)]"
          >
            {showPass ? "লুকান" : "দেখুন"}
          </button>
        </div>
      </Field>

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "লগইন হচ্ছে…" : "Login"}
      </button>

      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] p-2.5">
        <div className="mb-1.5 text-[11.5px] font-bold muted">ডেমো অ্যাকাউন্ট (ক্লিক করে পূরণ করুন)</div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <button type="button" className="btn btn-ghost btn-sm justify-start" onClick={() => fill("01700000000", "admin")}>
            🛡 Platform Admin
          </button>
          <button type="button" className="btn btn-ghost btn-sm justify-start" onClick={() => fill("01711111111", "manager123")}>
            👔 Gobra Manager
          </button>
          <button type="button" className="btn btn-ghost btn-sm justify-start" onClick={() => fill("01722222222", "member123")}>
            👤 Member (Azahar)
          </button>
          <button type="button" className="btn btn-ghost btn-sm justify-start" onClick={() => fill("01733333333", "audit123")}>
            🔎 Audit (Barishal)
          </button>
        </div>
        <p className="muted mt-1.5 text-[10.5px]">ডেমো পাসওয়ার্ড — প্রোডাকশনে বদলে নিন।</p>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════
 *  OFFICE SIGNUP (spec §12)
 * ══════════════════════════════════════════════════════════ */

function SignupForm({ busy, setBusy, errors, setErrors, setFormError, onSignedIn, onToast }: FormProps) {
  const [f, setF] = useState({
    officeName: "",
    branch: "",
    userId: "",
    managerName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [created, setCreated] = useState<{ code: string; name: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setBusy(true);
    try {
      const res = await apiPost<SignupResult>("/auth/signup", f);
      setCreated({ code: res.officeCode, name: res.office?.name ?? f.officeName });
      onToast?.(res.message ?? "অফিস তৈরি হয়েছে", "success");
      await onSignedIn(res as unknown as Record<string, unknown>);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        // নম্বরটি আগেই ব্যবহৃত (যেমন নিজের অ্যাডমিন লগইন) — তখন কী করণীয় সেটা বলে দিই
        setFormError(
          /ইতিমধ্যে/.test(err.message)
            ? `${err.message}। আপনি প্ল্যাটফর্ম অ্যাডমিন হলে লগইন করে অ্যাডমিন প্যানেল → “অফিস” ট্যাব থেকে অফিস বানান (সেখানে ম্যানেজারের আলাদা লগইনও একই ফর্মে তৈরি করা যায়); অথবা ম্যানেজারের জন্য একটি ভিন্ন মোবাইল নম্বর দিন।`
            : err.message,
        );
      } else {
        setFormError("অফিস তৈরি করা যায়নি");
      }
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="space-y-3 text-center">
        <div className="text-[34px]" aria-hidden>
          ✅
        </div>
        <h2 className="text-[17px] font-extrabold">অফিস তৈরি হয়েছে</h2>
        <p className="muted text-[12.5px]">
          <strong>{created.name}</strong> অফিসের জন্য আপনি ম্যানেজার হিসেবে যুক্ত হয়েছেন।
        </p>
        <div className="rounded-xl border-2 border-dashed border-[var(--brand)] bg-[var(--brand-soft)] p-3">
          <div className="text-[11.5px] font-bold muted">অফিস কোড / Office Code</div>
          <div className="text-[24px] font-black tracking-widest text-[var(--brand)]">{created.code}</div>
          <p className="muted text-[11.5px]">এই কোড দিয়ে সদস্যরা “সদস্য জয়েন” থেকে যুক্ত হতে পারবে।</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h2 className="text-[17px] font-extrabold">নতুন অফিস / মেস তৈরি করুন</h2>
        <p className="muted text-[12px]">অফিস + ম্যানেজার অ্যাকাউন্ট তৈরি হবে; কোড স্বয়ংক্রিয়।</p>
        <p className="muted mt-1 text-[11.5px]">নম্বর আগে ব্যবহৃত হলে অফিস তৈরি হবে না — ভিন্ন নম্বর দিন।</p>
      </div>

      <Field label="অফিসের নাম / Office Name" required error={errors.officeName}>
        <TextInput value={f.officeName} onChange={set("officeName")} placeholder="Gobra Mess" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ব্রাঞ্চ / Branch">
          <TextInput value={f.branch} onChange={set("branch")} placeholder="Barishal" />
        </Field>
        <Field label="User ID / মোবাইল নম্বর" required error={errors.userId}>
          <TextInput value={f.userId} onChange={set("userId")} placeholder="01711111111" inputMode="tel" />
        </Field>
      </div>
      <Field label="ম্যানেজারের নাম" required error={errors.managerName}>
        <TextInput value={f.managerName} onChange={set("managerName")} placeholder="Manager Name" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ইমেইল" error={errors.email}>
          <TextInput value={f.email} onChange={set("email")} type="email" placeholder="manager@example.com" />
        </Field>
        <Field label="মোবাইল" error={errors.phone}>
          <TextInput value={f.phone} onChange={set("phone")} placeholder="01711111111" inputMode="tel" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="পাসওয়ার্ড" required error={errors.password} hint="কমপক্ষে ৪ অক্ষর">
          <TextInput value={f.password} onChange={set("password")} type="password" autoComplete="new-password" />
        </Field>
        <Field label="কনফার্ম পাসওয়ার্ড" required error={errors.confirmPassword}>
          <TextInput value={f.confirmPassword} onChange={set("confirmPassword")} type="password" autoComplete="new-password" />
        </Field>
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "তৈরি হচ্ছে…" : "Create Office"}
      </button>
      <p className="muted text-center text-[11px]">অফিস তৈরি হলে আপনি ম্যানেজার হিসেবে লগইন হবেন।</p>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════
 *  MEMBER JOIN (spec §14)
 * ══════════════════════════════════════════════════════════ */

function JoinForm({ busy, setBusy, errors, setErrors, setFormError, onSignedIn, onToast }: FormProps) {
  const [f, setF] = useState({
    name: "",
    phone: "",
    userId: "",
    email: "",
    password: "",
    confirmPassword: "",
    officeCode: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setBusy(true);
    try {
      const payload = { ...f, userId: f.userId || f.phone };
      const res = await apiPost<JoinResult>("/auth/join", payload);
      onToast?.(res.message ?? "যোগদানের অনুরোধ পাঠানো হয়েছে", "success");
      await onSignedIn(res as unknown as Record<string, unknown>);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError("যোগদান করা যায়নি");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h2 className="text-[17px] font-extrabold">সদস্য হিসেবে যোগ দিন</h2>
        <p className="muted text-[12px]">অফিস কোড দিয়ে যুক্ত হন; অনুমোদনের পর হিসাব দেখতে পাবেন।</p>
      </div>

      <Field label="অফিস কোড / Office Code" required error={errors.officeCode} hint="যেমন: GOBRA01">
        <TextInput
          value={f.officeCode}
          onChange={set("officeCode")}
          placeholder="GOBRA01"
          className="uppercase tracking-wider"
          autoFocus
        />
      </Field>
      <Field label="সদস্যের নাম" required error={errors.name}>
        <TextInput value={f.name} onChange={set("name")} placeholder="আপনার নাম" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="মোবাইল / User ID" required error={errors.phone}>
          <TextInput value={f.phone} onChange={set("phone")} placeholder="01722222222" inputMode="tel" />
        </Field>
      </div>
      <Field label="ইমেইল (ঐচ্ছিক)" error={errors.email}>
        <TextInput value={f.email} onChange={set("email")} type="email" placeholder="you@example.com" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="পাসওয়ার্ড" required error={errors.password} hint="কমপক্ষে ৪ অক্ষর">
          <TextInput value={f.password} onChange={set("password")} type="password" autoComplete="new-password" />
        </Field>
        <Field label="কনফার্ম পাসওয়ার্ড" required error={errors.confirmPassword}>
          <TextInput value={f.confirmPassword} onChange={set("confirmPassword")} type="password" autoComplete="new-password" />
        </Field>
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "পাঠানো হচ্ছে…" : "Join"}
      </button>
    </form>
  );
}
