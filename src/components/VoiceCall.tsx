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
  ],
};

function parseCandidates(json: string): RTCIceCandidateInit[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function VoiceCallManager() {
  const app = useApp();
  const [incoming, setIncoming] = useState<VoiceCallRow | null>(null);
  const [outgoing, setOutgoing] = useState<VoiceCallRow | null>(null);
  const [activeCall, setActiveCall] = useState<VoiceCallRow | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const signalPollRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => {
        try { s.track?.stop(); } catch {}
      });
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    localCandidatesRef.current = [];
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    if (durationRef.current) clearInterval(durationRef.current);
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

  // Poll for incoming calls
  useEffect(() => {
    if (!app.user) return;
    const poll = async () => {
      try {
        const res = await mess<CallList>("voice.call.list");
        if (res.incoming && res.incoming.length > 0) {
          const call = res.incoming[0];
          // Only show if not already in a call
          if (!activeCall && !outgoing && !incoming) {
            setIncoming(call);
            // Play ringtone
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
              audio.loop = true;
              audio.play().catch(()=>{});
              setTimeout(()=>{ try{audio.pause();}catch{} }, 15000);
            } catch {}
          }
        }
        // Check if outgoing was accepted/rejected
        if (outgoing) {
          try {
            const fresh = await mess<VoiceCallRow>("voice.call.get", { callId: outgoing.id });
            if (fresh.status === "accepted") {
              setActiveCall(fresh);
              setOutgoing(null);
            } else if (fresh.status === "rejected" || fresh.status === "ended" || fresh.status === "missed") {
              app.toast(fresh.status === "rejected" ? "কল প্রত্যাখ্যান করা হয়েছে" : "কল শেষ হয়েছে", fresh.status === "rejected" ? "error" : "info");
              cleanup();
              setOutgoing(null);
            }
          } catch {}
        }
        // Check if active call ended by remote
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
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [app.user, outgoing, activeCall, incoming, cleanup, app]);

  // Duration counter for active call
  useEffect(() => {
    if (activeCall) {
      durationRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (durationRef.current) clearInterval(durationRef.current);
      setCallDuration(0);
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [activeCall]);

  const createPeerConnection = useCallback((callId: string, isCaller: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    localCandidatesRef.current = [];

    pc.onicecandidate = async (e) => {
      if (e.candidate) {
        localCandidatesRef.current.push(e.candidate.toJSON());
        // Send candidates to server (throttled)
        try {
          await mess("voice.call.candidates", {
            callId,
            candidates: localCandidatesRef.current,
            role: isCaller ? "caller" : "callee",
          });
        } catch {}
      }
    };

    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(()=>{});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        // Try restart ice
      }
      if (pc.connectionState === "connected") {
        app.toast("কল সংযুক্ত হয়েছে ✓", "success");
      }
    };

    return pc;
  }, [app]);

  const startOutgoingCall = useCallback(async (calleeId: string, calleeName: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = createPeerConnection("temp", true);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      // Wait a bit for ICE gathering
      await new Promise((r) => setTimeout(r, 500));

      const call = await mess<VoiceCallRow>("voice.call.initiate", {
        calleeId,
        offer: JSON.stringify(pc.localDescription),
      });

      setOutgoing(call);
      pcRef.current = pc;

      // Start polling for answer and remote candidates
      signalPollRef.current = setInterval(async () => {
        try {
          const sig = await mess<any>("voice.call.signal", { callId: call.id });
          if (sig.answer && pc.remoteDescription === null) {
            const answerDesc = JSON.parse(sig.answer);
            await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
            setActiveCall(sig);
            setOutgoing(null);
            if (signalPollRef.current) clearInterval(signalPollRef.current);
          }
          // Add remote candidates
          const remoteCands = sig.callerId === call.callerId ? sig.calleeCandidates : sig.callerCandidates;
          if (Array.isArray(remoteCands)) {
            for (const cand of remoteCands) {
              try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
            }
          }
        } catch {}
      }, 1500);

    } catch (err) {
      app.toast(err instanceof Error ? err.message : "মাইক্রোফোন অনুমতি দিন", "error");
      cleanup();
    }
  }, [app, createPeerConnection, cleanup]);

  const acceptIncomingCall = useCallback(async () => {
    if (!incoming) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = createPeerConnection(incoming.id, false);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offerDesc = JSON.parse(incoming.offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await new Promise((r) => setTimeout(r, 500));

      const updated = await mess<VoiceCallRow>("voice.call.accept", {
        callId: incoming.id,
        answer: JSON.stringify(pc.localDescription),
      });

      setActiveCall(updated);
      setIncoming(null);

      // Poll for caller candidates
      signalPollRef.current = setInterval(async () => {
        try {
          const sig = await mess<any>("voice.call.signal", { callId: incoming.id });
          const remoteCands = sig.callerCandidates;
          if (Array.isArray(remoteCands)) {
            for (const cand of remoteCands) {
              try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
            }
          }
        } catch {}
      }, 1500);

    } catch (err) {
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

  // Expose global function to initiate calls from anywhere
  useEffect(() => {
    (window as any).initiateVoiceCall = (calleeId: string, calleeName: string) => {
      if (activeCall || outgoing || incoming) {
        app.toast("আপনি ইতিমধ্যে একটি কলে আছেন", "error");
        return;
      }
      startOutgoingCall(calleeId, calleeName);
    };
    return () => { delete (window as any).initiateVoiceCall; };
  }, [startOutgoingCall, activeCall, outgoing, incoming, app]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Incoming Call Modal */}
      {incoming ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--card)] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-[var(--brand-soft)] text-3xl">
              📞
            </div>
            <div className="text-[18px] font-extrabold">{incoming.callerName}</div>
            <div className="muted text-[13px]">{incoming.callerUserId} কল করছে...</div>
            <div className="mt-1 flex justify-center gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]" style={{ animationDelay: '300ms' }} />
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={() => void rejectIncomingCall()} className="btn btn-danger h-14 w-14 rounded-full text-xl">
                ✕
              </button>
              <button type="button" onClick={() => void acceptIncomingCall()} className="btn btn-primary h-14 w-14 rounded-full bg-green-600 text-xl hover:bg-green-700">
                📞
              </button>
            </div>
            <div className="mt-4 flex justify-center gap-4 text-[12px]">
              <span className="text-[var(--danger)]">প্রত্যাখ্যান</span>
              <span className="text-green-600">গ্রহণ</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Outgoing Call Modal */}
      {outgoing ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--card)] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-[var(--brand-soft)] text-3xl animate-pulse">
              📞
            </div>
            <div className="text-[18px] font-extrabold">{outgoing.calleeName}</div>
            <div className="muted text-[13px]">কল করা হচ্ছে... {outgoing.calleeUserId}</div>
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={() => void endCall(outgoing.id)} className="btn btn-danger h-14 w-14 rounded-full text-xl">
                ✕
              </button>
            </div>
            <div className="muted mt-3 text-[11px]">রিং হচ্ছে...</div>
          </div>
        </div>
      ) : null}

      {/* Active Call UI */}
      {activeCall ? (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[var(--brand-soft)] to-[var(--card)] p-6">
          <div className="mt-8 text-center">
            <div className="mx-auto mb-4 grid h-24 w-24 place-items-center rounded-full bg-[var(--brand)] text-4xl text-white shadow-lg">
              {(activeCall.callerId === app.user?.id ? activeCall.calleeName : activeCall.callerName).slice(0, 1).toUpperCase()}
            </div>
            <div className="text-[20px] font-extrabold">
              {activeCall.callerId === app.user?.id ? activeCall.calleeName : activeCall.callerName}
            </div>
            <div className="muted text-[13px]">
              {activeCall.callerId === app.user?.id ? activeCall.calleeUserId : activeCall.callerUserId}
            </div>
            <div className="mt-2 text-[14px] font-mono font-bold tabular-nums">{formatDuration(callDuration)}</div>
            <div className="mt-1 flex justify-center gap-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-[11px] text-green-600">সংযুক্ত</span>
            </div>
          </div>

          <div className="mb-8 flex items-center gap-4">
            <button
              type="button"
              onClick={toggleMute}
              className={`grid h-14 w-14 place-items-center rounded-full border text-xl ${muted ? 'bg-[var(--danger)] text-white' : 'bg-[var(--card)] border-[var(--border)]'}`}
              title={muted ? "আনমিউট" : "মিউট"}
            >
              {muted ? "🔇" : "🎤"}
            </button>
            <button
              type="button"
              onClick={() => void endCall(activeCall.id)}
              className="grid h-16 w-16 place-items-center rounded-full bg-[var(--danger)] text-2xl text-white shadow-lg"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={() => setSpeaker((s) => !s)}
              className={`grid h-14 w-14 place-items-center rounded-full border text-xl ${speaker ? 'bg-[var(--brand)] text-white' : 'bg-[var(--card)] border-[var(--border)]'}`}
              title="স্পিকার"
            >
              🔊
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Small hook to get online users and call button */
export function VoiceUsersList() {
  const app = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const callUser = (u: any) => {
    if ((window as any).initiateVoiceCall) {
      (window as any).initiateVoiceCall(u.id, u.name);
    }
  };

  if (loading) return <div className="muted p-3 text-[12px]">লোড হচ্ছে...</div>;
  if (!users.length) return <div className="muted p-3 text-[12px]">একই অফিসে কোনো সক্রিয় ইউজার নেই</div>;

  return (
    <div className="space-y-1.5">
      {users.map((u) => (
        <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${u.online ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="truncate text-[13px] font-bold">{u.name}</span>
            </span>
            <span className="muted block truncate text-[11px]">{u.userId} • {u.role}</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => callUser(u)}>
            📞 কল
          </button>
        </div>
      ))}
    </div>
  );
}
