"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Badge, Card, EmptyState, Field, Loader, Modal, TextArea, TextInput } from "@/components/ui";
import { mess } from "@/lib/client";
import { toDisplayDateTime } from "@/lib/date";
import { SHEET_TAB_ORDER } from "@/lib/sheet-structure";
import type { SyncLogDTO } from "@/lib/types";

interface SheetStatus {
  scriptUrlConfigured: boolean;
  scriptUrl: string;
  sheetUrl: string;
  sheetId: string;
  lastSyncedAt: string | null;
  autoSync: boolean;
  logs: SyncLogDTO[];
}

interface PingResult {
  ok: boolean;
  message?: string;
  spreadsheetId?: string;
  spreadsheetName?: string;
  tabs?: string[];
  time?: string;
}

export function SheetView() {
  const app = useApp();
  const [status, setStatus] = useState<SheetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ping, setPing] = useState<PingResult | null>(null);
  const [pinging, setPinging] = useState(false);
  const [scriptUrl, setScriptUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [payload, setPayload] = useState<string>("");
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const canSync = app.can("sheet.sync");
  const canEditSettings = app.can("settings.write") || app.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mess<SheetStatus>("sheet.status");
      setStatus(res);
      setScriptUrl(res?.scriptUrl ?? "");
      setSheetUrl(res?.sheetUrl ?? "");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "শিট স্ট্যাটাস লোড করা যায়নি", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doPing = async () => {
    setPinging(true);
    try {
      const res = await mess<PingResult>("sheet.ping");
      setPing(res);
      app.toast(res?.ok ? "Apps Script ঠিকমতো সাড়া দিয়েছে ✓" : `Apps Script সাড়া দেয়নি: ${res?.message ?? ""}`, res?.ok ? "success" : "error");
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Ping ব্যর্থ", "error");
      setPing({ ok: false, message: err instanceof Error ? err.message : "Ping failed" });
    } finally {
      setPinging(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const res = await app.call<{ id: string }>("office.updateSettings", { scriptUrl, sheetUrl });
    setSavingSettings(false);
    if (res) {
      app.toast("শিট সেটিংস সংরক্ষিত হয়েছে ✓", "success");
      await load();
    }
  };

  const doSync = async () => {
    const res = await app.runSync();
    if (res.ok) await load();
  };

  const showPayload = async () => {
    setPayloadOpen(true);
    setPayloadLoading(true);
    try {
      const res = await mess<unknown>("sheet.payload", { monthId: app.month?.id });
      setPayload(JSON.stringify(res, null, 2));
    } catch (err) {
      setPayload(`Payload তৈরি করা যায়নি: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setPayloadLoading(false);
    }
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      app.toast("পে-লোড কপি হয়েছে ✓", "success");
    } catch {
      app.toast("কপি করা যায়নি — টেক্সট সিলেক্ট করে কপি করুন", "error");
    }
  };

  if (loading) return <Loader label="Loading Google Sheet status…" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[19px] font-extrabold leading-tight">গুগল শিট / Google Sheets Sync</h1>
          <p className="muted text-[12.5px]">
            PostgreSQL = মূল ডেটাবেস • Google Sheet = রিপোর্টিং/ব্যাকআপ কপি। সিংক ব্যর্থ হলেও ডেটাবেসের তথ্য নিরাপদ থাকবে।
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelpOpen(true)}>
            📖 সেটআপ গাইড
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void showPayload()}>
            {`{ }`} Payload দেখুন
          </button>
          {canSync ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={app.syncBusy} onClick={() => void doSync()}>
              {app.syncBusy ? "Syncing…" : "☁ Full Sheet Sync"}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── status ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card bodyClass="p-3">
          <div className="kpi-k">Apps Script</div>
          <div className="mt-1">
            <Badge tone={status?.scriptUrlConfigured ? "ok" : "warn"}>{status?.scriptUrlConfigured ? "configured" : "not configured"}</Badge>
          </div>
        </Card>
        <Card bodyClass="p-3">
          <div className="kpi-k">Google Sheet</div>
          <div className="mt-1">
            <Badge tone={status?.sheetUrl ? "ok" : "warn"}>{status?.sheetUrl ? "linked" : "not linked"}</Badge>
          </div>
        </Card>
        <Card bodyClass="p-3">
          <div className="kpi-k">Last Synced</div>
          <div className="text-[13px] font-bold">{status?.lastSyncedAt ? toDisplayDateTime(status.lastSyncedAt) : "—"}</div>
        </Card>
        <Card bodyClass="p-3">
          <div className="kpi-k">Auto Sync</div>
          <label className="mt-1 flex items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={app.autoSync}
              disabled={!canSync}
              onChange={(e) => {
                app.setAutoSync(e.target.checked);
                app.toast(e.target.checked ? "অটো সিংক চালু হয়েছে — প্রতিটি সেভের পর শিট হালনাগাদ হবে" : "অটো সিংক বন্ধ হয়েছে", "info");
              }}
            />
            {app.autoSync ? "চালু" : "বন্ধ"}
          </label>
        </Card>
      </div>

      {/* ── settings ───────────────────────────────── */}
      {canEditSettings ? (
        <Card title="সিংক সেটিংস / Sync Settings" subtitle={`অফিস: ${app.office?.name ?? ""} • মাস: ${app.month?.monthName ?? ""}`} bodyClass="p-3">
          <div className="grid gap-3">
            <Field
              label="Google Apps Script Web App URL (/exec)"
              hint="Apps Script → Deploy → New deployment → Web app → Execute as: Me, Access: Anyone → URL কপি করুন"
            >
              <TextInput value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} placeholder="https://script.google.com/macros/s/AKfycb.../exec" />
            </Field>
            <Field label="Google Sheet URL (এই অফিসের স্প্রেডশিট)" hint="Naming: Mess Meal Manager - <Office Name>">
              <TextInput value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/....../edit" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={savingSettings} onClick={() => void saveSettings()}>
                {savingSettings ? "সংরক্ষণ হচ্ছে…" : "💾 সেটিংস সংরক্ষণ"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pinging} onClick={() => void doPing()}>
                {pinging ? "Testing…" : "🔌 Connection Test (ping)"}
              </button>
            </div>

            {ping ? (
              <div
                className={`rounded-lg border px-3 py-2 text-[12.5px] ${
                  ping.ok ? "border-[var(--ok)] bg-[var(--ok-soft)] text-[var(--ok)]" : "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
              >
                <strong>{ping.ok ? "✓ সংযোগ সফল" : "⚠ সংযোগ ব্যর্থ"}</strong>
                {ping.message ? <div>{ping.message}</div> : null}
                {ping.spreadsheetName ? (
                  <div>
                    Spreadsheet: <strong>{ping.spreadsheetName}</strong>
                    {ping.spreadsheetId ? <span className="muted"> ({ping.spreadsheetId})</span> : null}
                  </div>
                ) : null}
                {ping.tabs?.length ? <div className="muted">ট্যাব: {ping.tabs.join(" • ")}</div> : null}
              </div>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card title="সিংক সেটিংস" bodyClass="p-3">
          <p className="muted text-[12.5px]">
            শিট URL ও Apps Script কনফিগারেশন শুধু ম্যানেজার/অ্যাডমিন পরিবর্তন করতে পারবেন। বর্তমান শিট:{" "}
            {status?.sheetUrl ? (
              <a className="link" href={status.sheetUrl} target="_blank" rel="noreferrer">
                খুলুন
              </a>
            ) : (
              "সংযুক্ত নেই"
            )}
          </p>
        </Card>
      )}

      {status?.sheetUrl ? (
        <Card title="Google Sheet" bodyClass="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <a className="btn btn-soft btn-sm" href={status.sheetUrl} target="_blank" rel="noreferrer">
              ↗ শিট খুলুন
            </a>
            <span className="muted text-[11.5px]">Sheet ID: {status.sheetId || "—"}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {SHEET_TAB_ORDER.map((t) => (
              <span key={t} className="pill pill-muted">
                {t}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ── sync logs (spec §98, §63) ───────────────── */}
      <Card title="সিংক লগ / Sync Log" subtitle="সর্বশেষ ২৫টি সিংক প্রচেষ্টা" bodyClass="p-0">
        {!status?.logs?.length ? (
          <div className="p-3">
            <EmptyState icon="☁" title="এখনো কোনো সিংক হয়নি" hint="“Full Sheet Sync” চাপলে এখানে লগ দেখা যাবে।" />
          </div>
        ) : (
          <div className="table-wrap" style={{ borderRadius: 0, borderWidth: 0 }}>
            <table className="data" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>সময়</th>
                  <th className="text-center">স্ট্যাটাস</th>
                  <th>Action</th>
                  <th>Trigger</th>
                  <th>MonthID</th>
                  <th className="num">সময় লেগেছে</th>
                  <th>মেসেজ</th>
                </tr>
              </thead>
              <tbody>
                {status.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="tabular-nums">{toDisplayDateTime(l.at)}</td>
                    <td className="text-center">
                      <Badge tone={l.ok ? "ok" : "danger"}>{l.ok ? "✓ ok" : "✗ failed"}</Badge>
                    </td>
                    <td>{l.action}</td>
                    <td>{l.trigger}</td>
                    <td className="muted text-[11px]">{l.monthId}</td>
                    <td className="num tabular-nums">{l.durationMs} ms</td>
                    <td className="muted max-w-[280px] truncate">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── payload modal ──────────────────────────── */}
      <Modal
        open={payloadOpen}
        title="Sync Payload (JSON)"
        subtitle="Apps Script টেস্ট করতে এই JSON কপি করে Code.gs-এর TEST_PAYLOAD এ পেস্ট করুন"
        onClose={() => setPayloadOpen(false)}
        wide
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setPayloadOpen(false)}>
              বন্ধ করুন
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void copyPayload()} disabled={payloadLoading}>
              কপি করুন
            </button>
          </div>
        }
      >
        {payloadLoading ? (
          <Loader label="Payload তৈরি হচ্ছে…" />
        ) : (
          <TextArea readOnly value={payload} className="min-h-[320px] font-mono text-[11px]" />
        )}
      </Modal>

      {/* ── setup guide ────────────────────────────── */}
      <Modal open={helpOpen} title="Google Apps Script সেটআপ গাইড" onClose={() => setHelpOpen(false)} wide>
        <ol className="space-y-2 text-[13px]">
          <li>
            <strong>১.</strong> একটি নতুন Google Spreadsheet খুলুন এবং নাম দিন: <code>Mess Meal Manager - {app.office?.name ?? "<Office Name>"}</code>
          </li>
          <li>
            <strong>২.</strong> Spreadsheet-এ <em>Extensions → Apps Script</em> খুলুন।
          </li>
          <li>
            <strong>৩.</strong> এই প্রজেক্টের <code>google-apps-script/Code.gs</code> ফাইলের সম্পূর্ণ কোড কপি করে Apps Script এডিটরে পেস্ট করুন।
          </li>
          <li>
            <strong>৪.</strong> <em>Deploy → New deployment → Web app</em> নির্বাচন করুন। Execute as: <strong>Me</strong>, Access:{" "}
            <strong>Anyone</strong>।
          </li>
          <li>
            <strong>৫.</strong> ডিপ্লয়মেন্টের পর যে <code>/exec</code> URL পাওয়া যাবে সেটি উপরের “Apps Script Web App URL” ঘরে বসান এবং
            সংরক্ষণ করুন।
          </li>
          <li>
            <strong>৬.</strong> <em>Connection Test (ping)</em> চেপে যাচাই করুন, তারপর <em>☁ Full Sheet Sync</em> চাপুন।
          </li>
          <li>
            <strong>৭.</strong> সিংক হলে ৮টি ট্যাব তৈরি/রিরাইট হবে: {SHEET_TAB_ORDER.join(", ")}।
          </li>
        </ol>
        <p className="muted mt-3 text-[12px]">
          বিকল্প: সার্ভার-সাইড environment variable <code>GOOGLE_SCRIPT_WEB_APP_URL</code> সেট করলে সব অফিস একই এন্ডপয়েন্ট
          ব্যবহার করবে। প্রতি অফিসের আলাদা URL দিতে চাইলে অ্যাডমিন প্যানেলের অফিস এডিট ফর্মে <code>scriptUrl</code> ঘর
          ব্যবহার করুন।
        </p>
      </Modal>
    </div>
  );
}
