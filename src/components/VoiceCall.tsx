"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { mess } from "@/lib/client";

interface VoiceCallRow {
  id: string;
  officeId: string;
  callerId: string;
  callerName: string;
  callerUserId: string;
  calleeId: string;
  calleeName: string;
  calleeUserId: string;
  status: string;
  offer: string;
  answer: string;
  callerCandidates: string;
  calleeCandidates: string;
  createdAt: string;
  updatedAt: string;
}

interface CallList {
  incoming: VoiceCallRow[];
  outgoing: VoiceCallRow[];
  active: VoiceCallRow[];
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve();
      }
    }, timeoutMs);
    const check = () => {
      if (pc.iceGatheringState === "complete" && !done) {
        done = true;
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function VoiceCallManager() {
  const app = useApp();
  const [incoming, setIncoming] = useState<VoiceCallRow | null>(null);
  const [outgoing, setOutgoing] = useState<VoiceCallRow | null>(null);
  const [activeCall, setActiveCall] = useState<VoiceCallRow | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const signalPollRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef<NodeJS.Timeout | null>(null);
  const remoteCandidatesAdded = useRef<Set<string>>(new Set());

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.getSenders().forEach((s) => { try { s.track?.stop(); } catch {} }); } catch {}
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      localStreamRef.current = null;
    }
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    if (durationRef.current) clearInterval(durationRef.current);
    remoteCandidatesAdded.current.clear();
    setCallDuration(0);
    setMuted(false);
  }, []);

  const endCall = useCallback(async (callId?: string) => {
    const id = callId || activeCall?.id || outgoing?.id || incoming?.id;
    if (id) {
      try { await mess("voice.call.end", { callId: id }); } catch {}
    }
    cleanup();
    setIncoming(null);
    setOutgoing(null);
    setActiveCall(null);
  }, [activeCall, outgoing, incoming, cleanup]);

  // Poll for incoming/outgoing calls every 2 seconds
  useEffect(() => {
    if (!app.user) return;
    const poll = async () => {
      try {
        const res = await mess<CallList>("voice.call.list");
        // Incoming
        if (res.incoming && res.incoming.length > 0) {
          const call = res.incoming[0];
          if (!activeCall && !outgoing) {
            // If we already have an incoming with same id, don't re-set
            if (!incoming || incoming.id !== call.id) {
              console.log("[voice] incoming call", call);
              setIncoming(call);
            }
          }
        } else {
          // No incoming, but if we had one that was cancelled, clear it
          if (incoming) {
            try {
              const fresh = await mess<VoiceCallRow>("voice.call.get", { callId: incoming.id });
              if (fresh.status !== "ringing") {
                setIncoming(null);
              }
            } catch {
              setIncoming(null);
            }
          }
        }

        // Outgoing status check
        if (outgoing) {
          try {
            const fresh = await mess<VoiceCallRow>("voice.call.get", { callId: outgoing.id });
            if (fresh.status === "accepted" && fresh.answer) {
              // Answer received, set remote description if not already
              if (pcRef.current && pcRef.current.signalingState !== "stable") {
                try {
                  const answerDesc = JSON.parse(fresh.answer);
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc));
                  console.log("[voice] outgoing accepted, remote description set");
                } catch (e) {
                  console.log("[voice] setRemoteDescription error", e);
                }
              }
              setActiveCall(fresh);
              setOutgoing(null);
            } else if (fresh.status === "rejected") {
              app.toast("কল প্রত্যাখ্যান করা হয়েছে", "error");
              cleanup();
              setOutgoing(null);
            } else if (fresh.status === "ended" || fresh.status === "missed") {
              app.toast(fresh.status === "missed" ? "কল মিস হয়েছে" : "কল শেষ হয়েছে", "info");
              cleanup();
              setOutgoing(null);
            }
          } catch {}
        }

        // Active call ended check
        if (activeCall) {
          try {
            const fresh = await mess<VoiceCallRow>("voice.call.get", { callId: activeCall.id });
            if (fresh.status === "ended" || fresh.status === "rejected") {
              app.toast("কল শেষ হয়েছে", "info");
              cleanup();
              setActiveCall(null);
            }
          } catch {}
        }
      } catch (e) {
        console.log("[voice] poll error", e);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [app.user, outgoing, activeCall, incoming, cleanup, app]);

  // Duration counter
  useEffect(() => {
    if (activeCall) {
      durationRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (durationRef.current) clearInterval(durationRef.current);
      setCallDuration(0);
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [activeCall]);

  const createPeerConnection = useCallback((isCaller: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    remoteCandidatesAdded.current.clear();

    pc.onicecandidate = (e) => {
      // For non-trickle, we wait for gathering complete, so we don't need to send candidates separately
      // But still log
      if (e.candidate) {
        console.log("[voice] ICE candidate", e.candidate.candidate.substring(0, 80));
      }
    };

    pc.ontrack = (e) => {
      console.log("[voice] ontrack", e.streams[0]?.getTracks().length);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch((err) => console.log("[voice] remote play error", err));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[voice] connectionState", pc.connectionState);
      if (pc.connectionState === "connected") {
        app.toast("কল সংযুক্ত হয়েছে ✓", "success");
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        // Don't auto end, let user decide
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[voice] iceConnectionState", pc.iceConnectionState);
    };

    return pc;
  }, [app]);

  const startOutgoingCall = useCallback(async (calleeId: string, calleeName: string) => {
    if (activeCall || outgoing || incoming) {
      app.toast("আপনি ইতিমধ্যে একটি কলে আছেন", "error");
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        app.toast("এই ব্রাউজারে ভয়েস কল সাপোর্ট করে না — Chrome ব্যবহার করুন", "error");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      } catch (mediaErr: any) {
        const name = mediaErr?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          app.toast("🎤 মাইক্রোফোন Allow করুন — ব্রাউজারে Allow চাপুন", "error");
          // Try silent fallback
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const dest = ctx.createMediaStreamDestination();
            stream = dest.stream;
          } catch {
            throw mediaErr;
          }
        } else {
          throw mediaErr;
        }
      }

      localStreamRef.current = stream;
      const pc = createPeerConnection(true);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc, 2500);

      console.log("[voice] initiating call to", calleeId, "offer", pc.localDescription?.type);

      const call = await mess<VoiceCallRow>("voice.call.initiate", {
        calleeId,
        offer: JSON.stringify(pc.localDescription),
      });

      setOutgoing(call);
      console.log("[voice] outgoing set", call.id);

      // Poll for answer via signal endpoint
      signalPollRef.current = setInterval(async () => {
        try {
          const sig = await mess<any>("voice.call.signal", { callId: call.id });
          if (sig.status === "rejected") {
            app.toast("কল প্রত্যাখ্যান করা হয়েছে", "error");
            cleanup();
            setOutgoing(null);
            if (signalPollRef.current) clearInterval(signalPollRef.current);
            return;
          }
          if (sig.status === "ended" || sig.status === "missed") {
            app.toast("কল শেষ হয়েছে", "info");
            cleanup();
            setOutgoing(null);
            if (signalPollRef.current) clearInterval(signalPollRef.current);
            return;
          }
          if (sig.answer && pc.signalingState !== "stable") {
            console.log("[voice] got answer", sig.answer.substring(0, 100));
            try {
              const answerDesc = JSON.parse(sig.answer);
              await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
              console.log("[voice] remote description set, call connected");
              setActiveCall({ ...call, ...sig, status: "accepted" } as any);
              setOutgoing(null);
              if (signalPollRef.current) clearInterval(signalPollRef.current);
            } catch (e) {
              console.log("[voice] setRemoteDescription answer error", e);
            }
          }
        } catch (e) {
          console.log("[voice] signal poll error", e);
        }
      }, 1200);

    } catch (err: any) {
      console.log("[voice] startOutgoingCall error", err);
      app.toast(err instanceof Error ? err.message : "কল শুরু করা যায়নি", "error");
      cleanup();
    }
  }, [app, createPeerConnection, cleanup]);

  const acceptIncomingCall = useCallback(async () => {
    if (!incoming) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        app.toast("ব্রাউজার সাপোর্ট করে না", "error");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      } catch (mediaErr: any) {
        const name = mediaErr?.name || "";
        if (name === "NotAllowedError") {
          app.toast("🎤 মাইক্রোফোন Allow করুন", "error");
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const dest = ctx.createMediaStreamDestination();
            stream = dest.stream;
          } catch {
            throw mediaErr;
          }
        } else {
          throw mediaErr;
        }
      }

      localStreamRef.current = stream;
      const pc = createPeerConnection(false);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      console.log("[voice] accepting call", incoming.id, "offer", incoming.offer.substring(0, 100));
      const offerDesc = JSON.parse(incoming.offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGatheringComplete(pc, 2500);

      console.log("[voice] sending answer", pc.localDescription?.type);

      const updated = await mess<VoiceCallRow>("voice.call.accept", {
        callId: incoming.id,
        answer: JSON.stringify(pc.localDescription),
      });

      setActiveCall(updated);
      setIncoming(null);
      console.log("[voice] call accepted, active", updated.id);

    } catch (err: any) {
      console.log("[voice] accept error", err);
      app.toast(err instanceof Error ? err.message : "কল গ্রহণ করা যায়নি", "error");
      cleanup();
      setIncoming(null);
    }
  }, [incoming, app, createPeerConnection, cleanup]);

  const rejectIncomingCall = useCallback(async () => {
    if (!incoming) return;
    try { await mess("voice.call.reject", { callId: incoming.id }); } catch {}
    cleanup();
    setIncoming(null);
  }, [incoming, cleanup]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
      setMuted((m) => !m);
    }
  }, []);

  useEffect(() => {
    (window as any).initiateVoiceCall = (calleeId: string, calleeName: string) => {
      startOutgoingCall(calleeId, calleeName);
    };
    return () => { delete (window as any).initiateVoiceCall; };
  }, [startOutgoingCall]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {incoming ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--card)] p-6 text-center shadow-2xl animate-[fadeIn_0.2s_ease-out]">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-[var(--brand-soft)] text-3xl animate-pulse">
              📞
            </div>
            <div className="text-[18px] font-extrabold">{incoming.callerName}</div>
            <div className="muted text-[13px]">{incoming.callerUserId} কল করছে...</div>
            <div className="mt-6 flex justify-center gap-4">
              <button type="button" onClick={() => void rejectIncomingCall()} className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-white text-2xl shadow-lg">
                ✕
              </button>
              <button type="button" onClick={() => void acceptIncomingCall()} className="grid h-16 w-16 place-items-center rounded-full bg-green-600 text-white text-2xl shadow-lg animate-pulse">
                📞
              </button>
            </div>
            <div className="mt-3 text-[11px] text-[var(--muted)]">কলটি 2 মিনিট পর auto miss হবে</div>
          </div>
        </div>
      ) : null}

      {outgoing ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--card)] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-[var(--brand-soft)] text-3xl animate-pulse">
              📞
            </div>
            <div className="text-[18px] font-extrabold">{outgoing.calleeName}</div>
            <div className="muted text-[13px]">কল করা হচ্ছে... {outgoing.calleeUserId}</div>
            <div className="mt-2 flex justify-center gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]" style={{ animationDelay: '300ms' }} />
            </div>
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={() => void endCall(outgoing.id)} className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-white text-2xl shadow-lg">
                ✕
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeCall ? (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[var(--brand-soft)] to-[var(--card)] p-6">
          <div className="mt-12 text-center">
            <div className="mx-auto mb-4 grid h-28 w-28 place-items-center rounded-full bg-[var(--brand)] text-4xl text-white shadow-xl">
              {(activeCall.callerId === app.user?.id ? activeCall.calleeName : activeCall.callerName).slice(0, 1).toUpperCase()}
            </div>
            <div className="text-[22px] font-extrabold">
              {activeCall.callerId === app.user?.id ? activeCall.calleeName : activeCall.callerName}
            </div>
            <div className="muted text-[13px]">
              {activeCall.callerId === app.user?.id ? activeCall.calleeUserId : activeCall.callerUserId}
            </div>
            <div className="mt-3 font-mono text-[18px] font-bold tabular-nums">{formatDuration(callDuration)}</div>
            <div className="mt-1 flex items-center justify-center gap-1.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
              <span className="text-[12px] font-semibold text-green-600">সংযুক্ত • কথা বলুন</span>
            </div>
          </div>

          <div className="mb-12 flex items-center gap-6">
            <button
              type="button"
              onClick={toggleMute}
              className={`grid h-14 w-14 place-items-center rounded-full border-2 text-xl shadow ${muted ? 'bg-red-600 border-red-600 text-white' : 'bg-[var(--card)] border-[var(--border)]'}`}
            >
              {muted ? "🔇" : "🎤"}
            </button>
            <button
              type="button"
              onClick={() => void endCall(activeCall.id)}
              className="grid h-20 w-20 place-items-center rounded-full bg-red-600 text-3xl text-white shadow-xl"
            >
              ✕
            </button>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--card)] border border-[var(--border)] text-[11px] font-bold">
              {formatDuration(callDuration)}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function VoiceUsersList() {
  const app = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await mess<any[]>("voice.users.online");
      setUsers(Array.isArray(res) ? res : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const callUser = (u: any) => {
    if ((window as any).initiateVoiceCall) {
      (window as any).initiateVoiceCall(u.id, u.name);
    }
  };

  if (loading) return <div className="muted p-3 text-[12px]">লোড হচ্ছে...</div>;

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.userId?.toLowerCase().includes(q) ||
      u.officeName?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const onlineCount = users.filter((u) => u.online).length;
  const isAdmin = app.user?.role === "admin";

  if (!users.length) return <div className="muted p-3 text-[12px]">একই অফিসে কোনো সক্রিয় ইউজার নেই — অন্য ব্রাউজারে লগইন করুন</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="muted">
          মোট {users.length} জন • <span className="text-green-600 font-bold">{onlineCount} অনলাইন</span> • {users.length - onlineCount} অফলাইন
        </span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => void load()}>↻ রিফ্রেশ</button>
      </div>

      <input
        type="text"
        placeholder={isAdmin ? "নাম / ID / অফিস দিয়ে খুঁজুন..." : "নাম দিয়ে খুঁজুন..."}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="input input-sm w-full text-[12px]"
      />

      <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
        {filtered.map((u) => (
          <div key={u.id} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${u.online ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10' : 'border-[var(--border)]'}`}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${u.online ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="truncate text-[13px] font-bold">{u.name}</span>
                {u.online ? <span className="rounded bg-green-100 px-1 py-0 text-[9px] font-bold text-green-700">LIVE</span> : null}
              </span>
              <span className="muted block truncate text-[11px]">
                {u.userId} • {u.role}
                {isAdmin && u.officeName ? ` • ${u.officeName}` : ""}
                {u.online ? " • 🟢 অনলাইন" : " • ⚪ অফলাইন"}
              </span>
              {u.lastLogin ? <span className="muted block text-[10px]">শেষ লগইন: {new Date(u.lastLogin).toLocaleString('bn-BD')}</span> : null}
            </span>
            <button type="button" className={`btn btn-sm shrink-0 ${u.online ? 'btn-primary' : 'btn-soft'}`} onClick={() => callUser(u)}>
              📞 কল
            </button>
          </div>
        ))}
        {filtered.length === 0 ? <div className="muted p-2 text-[11px]">কোনো ইউজার পাওয়া যায়নি</div> : null}
      </div>
    </div>
  );
}
