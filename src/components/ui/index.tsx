"use client";

import React, { useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════
 *  Toasts
 * ══════════════════════════════════════════════════════════ */

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let toastSeq = 1;

export function ToastStack({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[100] flex flex-col items-center gap-2 px-3 sm:bottom-5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`fade-in pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13.5px] font-semibold shadow-lg ${
            t.kind === "success"
              ? "border-[var(--ok)] bg-[var(--ok-soft)] text-[var(--ok)]"
              : t.kind === "error"
                ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          }`}
          role="status"
        >
          <span aria-hidden>{t.kind === "success" ? "✓" : t.kind === "error" ? "⚠" : "ℹ"}</span>
          <span className="flex-1 break-words">{t.message}</span>
          <button
            type="button"
            onClick={() => onClose(t.id)}
            className="ml-1 rounded px-1 text-[15px] leading-none opacity-70 hover:opacity-100"
            aria-label="বন্ধ করুন"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const close = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current[id];
    if (timer) clearTimeout(timer);
    delete timers.current[id];
  };

  const push = (message: string, kind: ToastKind = "info", ms = 3800) => {
    const id = toastSeq++;
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    timers.current[id] = setTimeout(() => close(id), ms);
    return id;
  };

  useEffect(() => {
    const store = timers.current;
    return () => {
      Object.values(store).forEach(clearTimeout);
    };
  }, []);

  return { toasts, push, close };
}

/* ══════════════════════════════════════════════════════════
 *  Modal (edit forms, spec §75)
 * ══════════════════════════════════════════════════════════ */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  z = "z-[90]",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** অন্য মোডালের ভেতর থেকে খুললে উপরে দেখানোর জন্য বড় মান দিন */
  z?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${z} flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4`} role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-label="বন্ধ করুন" onClick={onClose} />
      <div
        className={`fade-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-[15px] font-bold leading-tight">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[18px] leading-none muted hover:bg-[var(--brand-soft)]" aria-label="বন্ধ করুন">
            ×
          </button>
        </div>
        <div className="modal-scroll flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <div className="border-t border-[var(--border)] px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Delete confirmation (spec §76)
 * ══════════════════════════════════════════════════════════ */

export function ConfirmDialog({
  open,
  title = "আপনি কি এই তথ্যটি মুছে ফেলতে চান?",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "মুছে ফেলা হচ্ছে…" : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-[13.5px] muted">{message ?? "এই কাজটি ফেরানো যাবে না।"}</p>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Loaders / empty states (spec §90–§91)
 * ══════════════════════════════════════════════════════════ */

export function Loader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] muted">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
      {label}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton h-[74px]" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, icon = "📭", action }: { title: string; hint?: string; icon?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
      <div className="text-[26px]" aria-hidden>
        {icon}
      </div>
      <div className="text-[14px] font-bold">{title}</div>
      {hint ? <div className="muted max-w-sm text-[12.5px]">{hint}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onReload }: { message: string; onReload?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-8 text-center">
      <div className="text-[26px]" aria-hidden>
        ⚠️
      </div>
      <div className="text-[14px] font-bold text-[var(--danger)]">অ্যাপ লোড হতে সমস্যা হয়েছে।</div>
      <div className="max-w-md break-words text-[12.5px] text-[var(--danger)]">{message}</div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onReload ?? (() => window.location.reload())}>
        Reload
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 *  Form primitives — mobile friendly, big targets (spec §74)
 * ══════════════════════════════════════════════════════════ */

export function Field({
  label,
  error,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">
        {label}
        {required ? <span className="text-[var(--danger)]"> *</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[11.5px] font-semibold text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="number" inputMode="decimal" className={`input tabular-nums ${props.className ?? ""}`} />;
}

export function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="number" inputMode="decimal" min={0} step="0.01" className={`input tabular-nums ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input min-h-[70px] ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className ?? ""}`} />;
}

export function FormRow({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  const cls = cols === 1 ? "grid-cols-1" : cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2";
  return <div className={`grid gap-3 ${cls}`}>{children}</div>;
}

/* ══════════════════════════════════════════════════════════
 *  Layout helpers
 * ══════════════════════════════════════════════════════════ */

export function Card({ title, action, children, className = "", bodyClass = "p-3 sm:p-4" }: { title?: string; /** @deprecated বর্ণনা সরানো হয়েছে — প্রপ গ্রহণ করা হয় কিন্তু দেখানো হয় না */ subtitle?: string; action?: React.ReactNode; children?: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card ${className}`}>
      {title || action ? (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 sm:px-3.5">
          {title ? <h2 className="section-title">{title}</h2> : <span />}
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, tone = "default", icon }: { label: string; value: string; /** @deprecated বর্ণনা সরানো হয়েছে */ sub?: string; tone?: "default" | "ok" | "warn" | "danger" | "brand"; icon?: string }) {
  const color =
    tone === "ok"
      ? "var(--ok)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "danger"
          ? "var(--danger)"
          : tone === "brand"
            ? "var(--brand)"
            : "var(--text)";
  const accent = tone === "default" ? "var(--border)" : color;
  return (
    <div className="kpi" style={{ borderLeft: `3px solid ${accent}` }}>
      {icon ? (
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[12px]">
          {icon}
        </span>
      ) : null}
      <span className="kpi-k">{label}</span>
      <span className="kpi-v tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "ok" | "warn" | "danger" | "muted" | "brand" }) {
  const cls = tone === "ok" ? "pill-ok" : tone === "warn" ? "pill-warn" : tone === "danger" ? "pill-danger" : tone === "brand" ? "pill-brand" : "pill-muted";
  return <span className={`pill ${cls}`}>{children}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === "active" || status === "approved" ? "ok" : status === "pending" ? "warn" : status === "inactive" || status === "rejected" ? "danger" : "muted";
  const bn = status === "active" ? "সক্রিয়" : status === "approved" ? "অনুমোদিত" : status === "pending" ? "অপেক্ষমাণ" : status === "rejected" ? "বাতিল" : status === "inactive" ? "নিষ্ক্রিয়" : status;
  return <Badge tone={tone as "ok"}>{bn}</Badge>;
}

export function SegmentedButtons<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md font-semibold transition ${size === "sm" ? "px-2 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]"} ${
            value === o.value ? "bg-[var(--brand)] text-white" : "muted hover:bg-[var(--brand-soft)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MealStepper({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const step = 0.5;
  const set = (v: number) => onChange(Math.max(0, Math.round(v * 100) / 100));
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`btn btn-ghost ${compact ? "h-8 w-8 px-0 text-[16px]" : "h-9 w-9 px-0 text-[17px]"}`}
        onClick={() => set(value - step)}
        disabled={disabled || value <= 0}
        aria-label="কমান"
      >
        −
      </button>
      <input
        type="number"
        step={step}
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => set(Number(e.target.value))}
        disabled={disabled}
        className={`meal-cell ${compact ? "w-[46px]" : ""}`}
        aria-label="মিল সংখ্যা"
      />
      <button
        type="button"
        className={`btn btn-ghost ${compact ? "h-8 w-8 px-0 text-[16px]" : "h-9 w-9 px-0 text-[17px]"}`}
        onClick={() => set(value + step)}
        disabled={disabled}
        aria-label="বাড়ান"
      >
        +
      </button>
    </div>
  );
}
