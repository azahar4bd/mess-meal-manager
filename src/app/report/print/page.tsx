"use client";

/**
 * /report/print — standalone print-ready reports with 3 types:
 * - dena-paona (দেনা-পাওনা)
 * - bazar (বাজার লিস্ট তারিখ ভিত্তিক)
 * - meals (মিল সংখ্যা তারিখ ভিত্তিক)
 * Plus full report (default)
 */
import React, { useCallback, useEffect, useState } from "react";
import { AppProvider, useApp } from "@/components/app-context";
import { Loader, ErrorState } from "@/components/ui";
import { mess } from "@/lib/client";
import { buildPrintHtml, buildDenaPaonaHtml, buildBazarListHtml, buildMealCountHtml } from "@/lib/report-pdf";
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

type ReportType = "full" | "dena" | "bazar" | "meals";

function PrintReport() {
  const app = useApp();
  const [state, setState] = useState<{ loading: boolean; error: string | null; html: string; type: ReportType }>({
    loading: true,
    error: null,
    html: "",
    type: "full",
  });
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async (overrideType?: ReportType, overrideFrom?: string, overrideTo?: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams(window.location.search);
      const type = (overrideType || (params.get("type") as ReportType) || "full") as ReportType;
      const fDate = overrideFrom ?? params.get("fromDate") ?? fromDate ?? undefined;
      const tDate = overrideTo ?? params.get("toDate") ?? toDate ?? undefined;

      const res = await mess<ReportResponse>("report.summary", {
        monthId: params.get("monthId") ?? undefined,
        fromDate: fDate || undefined,
        toDate: tDate || undefined,
      });
      const office = res.office ?? app.office;
      if (!office) {
        setState({ loading: false, error: "অফিস তথ্য পাওয়া যায়নি", html: "", type });
        return;
      }

      let html = "";
      const input = {
        office,
        data: res.data,
        summary: res.summary,
        fromDate: res.fromDate,
        toDate: res.toDate,
        preparedBy: app.user?.name ?? "",
      };

      if (type === "dena") html = buildDenaPaonaHtml(input);
      else if (type === "bazar") html = buildBazarListHtml(input);
      else if (type === "meals") html = buildMealCountHtml(input);
      else html = buildPrintHtml(input);

      setState({ loading: false, error: null, html, type });
    } catch (err) {
      setState({ loading: false, error: err instanceof Error ? err.message : "রিপোর্ট লোড করা যায়নি", html: "", type: "full" });
    }
  }, [app.office?.id, app.user?.name, fromDate, toDate]);

  useEffect(() => {
    if (app.user && app.office) {
      const params = new URLSearchParams(window.location.search);
      const f = params.get("fromDate") || "";
      const t = params.get("toDate") || "";
      if (f) setFromDate(f);
      if (t) setToDate(t);
      void load();
    }
  }, [app.user?.id, app.office?.id]);

  if (!app.user) {
    return (
      <div className="p-6 text-center">
        <Loader label="লগইন চেক হচ্ছে…" />
        <p className="muted mt-2 text-[12.5px]">রিপোর্ট দেখতে প্রথমে লগইন করুন।</p>
        <a className="btn btn-primary btn-sm mt-2" href="/">লগইন পেজ</a>
      </div>
    );
  }

  if (state.loading) return <div className="p-6"><Loader label="Loading report…" /></div>;
  if (state.error) return <div className="p-6"><ErrorState message={state.error} onReload={() => void load()} /></div>;

  const updateUrl = (type: ReportType) => {
    const params = new URLSearchParams(window.location.search);
    params.set("type", type);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
    void load(type, fromDate, toDate);
  };

  const applyDateFilter = () => {
    const params = new URLSearchParams(window.location.search);
    if (fromDate) params.set("fromDate", fromDate);
    else params.delete("fromDate");
    if (toDate) params.set("toDate", toDate);
    else params.delete("toDate");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    void load(undefined, fromDate, toDate);
  };

  return (
    <div>
      <div className="no-print mx-auto mb-3 max-w-[280mm] space-y-2 px-2 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a className="btn btn-ghost btn-sm" href="/">← অ্যাপে ফিরুন</a>
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>রিফ্রেশ</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨 প্রিন্ট / Save as PDF</button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="mb-2 text-[12px] font-bold">📋 প্রিন্ট অপশন — ৩টি রিপোর্ট</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <button type="button" onClick={() => updateUrl("full")} className={`btn btn-sm ${state.type==="full" ? "btn-primary" : "btn-ghost border"}`}>📄 Full Report</button>
            <button type="button" onClick={() => updateUrl("dena")} className={`btn btn-sm ${state.type==="dena" ? "btn-primary" : "btn-ghost border"}`}>💸 দেনা-পাওনা</button>
            <button type="button" onClick={() => updateUrl("bazar")} className={`btn btn-sm ${state.type==="bazar" ? "btn-primary" : "btn-ghost border"}`}>🧺 বাজার লিস্ট</button>
            <button type="button" onClick={() => updateUrl("meals")} className={`btn btn-sm ${state.type==="meals" ? "btn-primary" : "btn-ghost border"}`}>🍽️ মিল সংখ্যা</button>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block min-w-[140px] flex-1">
              <span className="label text-[11px]">শুরু তারিখ</span>
              <input type="date" className="input input-sm h-8 w-full text-[12px]" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} />
            </label>
            <label className="block min-w-[140px] flex-1">
              <span className="label text-[11px]">শেষ তারিখ</span>
              <input type="date" className="input input-sm h-8 w-full text-[12px]" value={toDate} onChange={(e)=>setToDate(e.target.value)} />
            </label>
            <button type="button" className="btn btn-soft btn-sm h-8" onClick={applyDateFilter}>🔍 তারিখ ফিল্টার</button>
            <button type="button" className="btn btn-ghost btn-sm h-8" onClick={()=>{setFromDate(""); setToDate(""); const p=new URLSearchParams(window.location.search); p.delete("fromDate"); p.delete("toDate"); window.history.replaceState({}, "", `${window.location.pathname}?${p.toString()}`); void load();}}>পুরো মাস</button>
          </div>
          <div className="muted mt-1.5 text-[10.5px]">তারিখ ভিত্তিক রিপোর্ট: বাজার লিস্ট ও মিল সংখ্যা নির্বাচিত তারিখ অনুযায়ী ফিল্টার হবে। দেনা-পাওনা ওই তারিখের হিসাব অনুযায়ী দেখাবে।</div>
        </div>
      </div>

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
