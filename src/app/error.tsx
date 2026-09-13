"use client";

/**
 * Route-level error boundary (spec §89, §106).
 * A crash anywhere in the app renders this instead of a blank screen.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--danger)] bg-[var(--card)] p-5 text-center shadow-lg">
        <div className="text-[34px]" aria-hidden>
          ⚠️
        </div>
        <h1 className="mt-2 text-[18px] font-extrabold text-[var(--danger)]">অ্যাপ লোড হতে সমস্যা হয়েছে।</h1>
        <p className="muted mt-1 text-[13px]">
          দুঃখিত, এই পেজটি দেখাতে গিয়ে একটি ত্রুটি হয়েছে। আপনার কোনো তথ্য ডেটাবেসে নিরাপদ আছে।
        </p>
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-left text-[12px]">
          <div className="font-bold">Error message</div>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[var(--danger)]">
            {error?.message || "Unknown error"}
            {error?.digest ? `\ndigest: ${error.digest}` : ""}
          </pre>
          {isDev && error?.stack ? (
            <pre className="muted mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px]">{error.stack}</pre>
          ) : null}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" className="btn btn-primary" onClick={reset}>
            আবার চেষ্টা করুন
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
