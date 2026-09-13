"use client";

/**
 * Root-level error boundary (spec §106) — catches crashes in the root layout
 * itself so the user never sees a blank white screen.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="bn">
      <body style={{ margin: 0, fontFamily: "'Noto Sans Bengali','Hind Siliguri',system-ui,sans-serif", background: "#f4f6f8", color: "#101828" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              border: "1px solid #e4e7ec",
              borderLeft: "6px solid #b42318",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 8px 24px rgba(16,24,40,.10)",
            }}
          >
            <div style={{ fontSize: 34 }}>⚠️</div>
            <h1 style={{ margin: "8px 0 4px", fontSize: 19, fontWeight: 800, color: "#b42318" }}>
              অ্যাপ লোড হতে সমস্যা হয়েছে।
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, color: "#667085" }}>
              অপ্রত্যাশিত একটি ত্রুটির কারণে পেজটি দেখানো যাচ্ছে না। নিচের বাটনে ক্লিক করে আবার চেষ্টা করুন — আপনার সংরক্ষিত
              হিসাব ডেটাবেসে নিরাপদ আছে।
            </p>
            <pre
              style={{
                marginTop: 12,
                padding: 10,
                background: "#f9fafb",
                border: "1px solid #e4e7ec",
                borderRadius: 8,
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 160,
                overflow: "auto",
              }}
            >
              {error?.message || "Unknown error"}
              {error?.digest ? `\ndigest: ${error.digest}` : ""}
            </pre>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{ background: "#226e4a", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                আবার চেষ্টা করুন
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ background: "#fff", color: "#226e4a", border: "1px solid #226e4a", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Reload
              </button>
              <a
                href="/"
                style={{ background: "#fff", color: "#475467", border: "1px solid #e4e7ec", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
              >
                হোম পেজ
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
