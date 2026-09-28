"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Card, Badge, EmptyState, Loader } from "@/components/ui";
import { mess } from "@/lib/client";
import { toDisplayDateTime } from "@/lib/date";
import { VoiceUsersList } from "@/components/VoiceCall";

interface VoiceCallRow {
  id: string;
  callerName: string;
  calleeName: string;
  callerUserId: string;
  calleeUserId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function VoiceView() {
  const app = useApp();
  const [history, setHistory] = useState<VoiceCallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      // Get recent calls from DB via custom query - we will use voice.call.list history
      // For now, fetch from voice_calls table via API that returns recent
      const res = await mess<any>("voice.call.history").catch(() => ({ calls: [] }));
      const calls = res.calls || res || [];
      setHistory(Array.isArray(calls) ? calls : []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    const t = setInterval(loadHistory, 10000);
    return () => clearInterval(t);
  }, [loadHistory]);

  return (
    <div className="space-y-3">
      <h1 className="text-[17px] font-extrabold leading-tight">📞 ভয়েস কল — WebRTC</h1>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-[12px] leading-snug">
        <div className="font-bold">কীভাবে কাজ করে?</div>
        <ul className="mt-1 list-disc pl-5 text-[11.5px] text-[var(--muted)]">
          <li>একই অফিসের সদস্যরা ইন্টারনেটে সরাসরি ভয়েস কল করতে পারবে — কোনো ফোন নম্বর বা টাকা লাগবে না</li>
          <li>WebRTC P2P — অডিও সরাসরি দুজনের মধ্যে যাবে, সার্ভারে রেকর্ড হবে না</li>
          <li>মাইক্রোফোন অনুমতি দিতে হবে — ব্রাউজার অনুমতি চাইলে Allow দিন</li>
          <li>কল আসলে স্ক্রিনে বড় পপআপ আসবে — Accept/Reject করতে পারবেন</li>
        </ul>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="🟢 অনলাইন ইউজার — একই অফিস" subtitle="কল করতে 📞 বাটন চাপুন" bodyClass="p-3">
          <VoiceUsersList />
        </Card>

        <Card title="📋 সাম্প্রতিক কল" subtitle="শেষ 20টি কল" bodyClass="p-0">
          {loading ? (
            <div className="p-4"><Loader label="লোড হচ্ছে..." /></div>
          ) : history.length === 0 ? (
            <div className="p-4"><EmptyState icon="📞" title="এখনো কোনো কল হয়নি" hint="উপরের তালিকা থেকে কল করুন" /></div>
          ) : (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="data" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>সময়</th>
                    <th>থেকে → প্রতি</th>
                    <th className="text-center">স্ট্যাটাস</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map((c) => (
                    <tr key={c.id}>
                      <td className="text-[11px] tabular-nums">{toDisplayDateTime(c.createdAt)}</td>
                      <td className="text-[11px]">
                        <span className="font-bold">{c.callerName}</span> → <span className="font-bold">{c.calleeName}</span>
                        <span className="muted block text-[10px]">{c.callerUserId} → {c.calleeUserId}</span>
                      </td>
                      <td className="text-center">
                        <Badge tone={c.status === "accepted" || c.status === "ended" ? "ok" : c.status === "ringing" ? "warn" : "danger"}>
                          {c.status === "ringing" ? "Ringing" : c.status === "accepted" ? "Accepted" : c.status === "ended" ? "Ended" : c.status === "rejected" ? "Rejected" : c.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="🔧 টেস্ট ও টিপস" bodyClass="p-3 text-[12px]">
        <ul className="list-disc pl-5 text-[11.5px] text-[var(--muted)]">
          <li>মোবাইলে Chrome/Firefox ব্যবহার করুন — Safari-তে মাইক্রোফোন সমস্যা হতে পারে</li>
          <li>একই WiFi-তে থাকলে কল সবচেয়ে ভালো কাজ করে</li>
          <li>কল না গেলে: দুজনেই পেজ রিফ্রেশ করুন, মাইক্রোফোন অনুমতি Allow করুন</li>
          <li>অফিস আলাদা হলে কল যাবে না — একই অফিসের মধ্যে কল</li>
        </ul>
      </Card>
    </div>
  );
}
