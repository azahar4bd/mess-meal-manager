"use client";

/**
 * /report/print — standalone print-ready monthly report.
 * Open it and use "Save as PDF" from the browser print dialog (spec §42).
 */
import React, { useCallback, useEffect, useState } from "react";
import { AppProvider, useApp } from "@/components/app-context";
import { Loader, ErrorState } from "@/components/ui";
import { mess } from "@/lib/client";
import { buildPrintHtml } from "@/lib/report-pdf";
import type { MessData, MonthSummary, OfficeDTO } from "@/lib/types";

interface ReportResponse {
  office: OfficeDTO | null;
  month: { id: string; monthName: string; year: number; month: number; totalDays: number };
  fromDate: string | null;
  toDate: string | null;
  summary: MonthSummary;
  data: MessData;
  selfOnly: boolean;
}

function PrintReport() {
  const app = useApp();
  const [state, setState] = useState<{ loading: boolean; error: string | null; html: string }>({
    loading: true,
    error: null,
    html: "",
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await mess<ReportResponse>("report.summary", {
        monthId: params.get("monthId") ?? undefined,
        fromDate: params.get("fromDate") ?? undefined,
        toDate: params.get("toDate") ?? undefined,
      });
      const office = res.office ?? app.office;
      if (!office) {
        setState({ loading: false, error: "অফিস তথ্য পাওয়া যায়নি", html: "" });
        return;
      }
      const html = buildPrintHtml({
        office,
        data: res.data,
        summary: res.summary,
        fromDate: res.fromDate,
        toDate: res.toDate,
        preparedBy: app.user?.name ?? "",
      });
      setState({ loading: false, error: null, html });
    } catch (err) {
      setState({ loading: false, error: err instanceof Error ? err.message : "রিপোর্ট লোড করা যায়নি", html: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.office?.id]);

  useEffect(() => {
    if (app.user && app.office) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.user?.id, app.office?.id]);

  if (!app.user) {
    return (
      <div className="p-6 text-center">
        <Loader label="লগইন চেক হচ্ছে…" />
        <p className="muted mt-2 text-[12.5px]">রিপোর্ট দেখতে প্রথমে লগইন করুন।</p>
        <a className="btn btn-primary btn-sm mt-2" href="/">
          লগইন পেজ
        </a>
      </div>
    );
  }

  if (state.loading) return <div className="p-6"><Loader label="Loading report…" /></div>;
  if (state.error) return <div className="p-6"><ErrorState message={state.error} onReload={() => void load()} /></div>;

  return (
    <div>
      <div
        className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-end gap-2 px-2 pt-3"
      >
        <a className="btn btn-ghost btn-sm" href="/">
          ← অ্যাপে ফিরুন
        </a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
          রিফ্রেশ
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          🖨 প্রিন্ট / Save as PDF
        </button>
      </div>
      {/* the generated report is a self-contained document with its own styles */}
      <div dangerouslySetInnerHTML={{ __html: state.html }} />
    </div>
  );
}

export default function PrintReportPage() {
  return (
    <AppProvider>
      <PrintReport />
    </AppProvider>
  );
}
