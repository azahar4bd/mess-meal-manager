"use client";

/**
 * Thin client-side API helper. Every request goes through the same
 * server-side authorization chain, so the UI never trusts itself.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  fields: Record<string, string>;
  constructor(message: string, code = "error", status = 400, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  action?: string;
  error?: string;
  code?: string;
  fields?: Record<string, string>;
  message?: string;
  [k: string]: unknown;
}

/**
 * একমাত্র জায়গা যেখানে API পাথ তৈরি হয় — '/api' প্রিফিক্স যেন কোনোদিন বাদ না পড়ে।
 * (আগে mess()/syncRaw() সরাসরি "/mess" ও "/sync" কল করত → সবসময় 404, অথচ API টেস্টগুলো
 * সরাসরি /api/mess কল করায় বাগটা ধরা পড়েনি। তাই এখন প্রতিটি হেল্পার এই ফাংশন দিয়েই যায়।)
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path; // সম্পূর্ণ URL (যেমন Apps Script) অপরিবর্তিত
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.startsWith("/api/") ? p : `/api${p}`;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
      ...init,
    });
  } catch (err) {
    throw new ApiError(
      "নেটওয়ার্ক সংযোগ পাওয়া যায়নি। ইন্টারনেট চেক করে আবার চেষ্টা করুন।",
      "network-error",
      0,
    ) as ApiError & { cause?: unknown };
  }

  const text = await res.text();
  let json: ApiEnvelope<T>;
  try {
    json = text ? (JSON.parse(text) as ApiEnvelope<T>) : ({ ok: res.ok } as ApiEnvelope<T>);
  } catch {
    // উত্তর JSON নয় — প্রায় সবসময় মানে রুটটাই অস্তিত্বহীন: ভুল/মৃত ডোমেইন (Vercel-এর
    // "DEPLOYMENT_NOT_FOUND" টেক্সট পেজ), পুরনো ক্যাশ, বা প্রক্সি এরর পেজ। তাই শুধু কোড না
    // দেখিয়ে কোন পাথে ব্যর্থ হলো আর কী করলে ঠিক হবে সেটাও বলে দিই।
    const path = url.split("?")[0];
    const hint =
      res.status === 404 || res.status === 502 || res.status === 503
        ? ` — ${path} পাওয়া যায়নি। পেজটি হার্ড রিফ্রেশ দিন (Ctrl/Cmd + Shift + R); তাতেও না হলে সঠিক ঠিকানা https://messmealmanager.vercel.app খুলুন।`
        : "";
    throw new ApiError(`সার্ভার থেকে অপ্রত্যাশিত উত্তর (HTTP ${res.status})${hint}`, "bad-response", res.status);
  }

  if (!res.ok || json.ok === false) {
    throw new ApiError(
      String(json.error ?? json.message ?? `HTTP ${res.status}`),
      String(json.code ?? "error"),
      res.status,
      json.fields ?? {},
    );
  }
  return json;
}

export async function apiGet<T>(path: string, params: Record<string, string | number | undefined | null> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const json = await request<T>(`${apiUrl(path)}${suffix}`);
  return (json.data ?? json) as T;
}

export async function apiPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const json = await request<T>(apiUrl(path), { method: "POST", body: JSON.stringify(body) });
  return (json.data ?? json) as T;
}

/** POST /api/mess with an action — the main data channel */
export async function mess<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const json = await request<{ action: string; data: T }>(apiUrl("/mess"), {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
  const data = json.data;
  if (data && typeof data === "object" && "data" in (data as Record<string, unknown>)) {
    return (data as { data: T }).data;
  }
  return data as T;
}

/** POST /api/sync — returns the raw Apps-Script-shaped response (spec §99) */
export async function syncRaw(body: Record<string, unknown> = {}): Promise<ApiEnvelope<unknown>> {
  return request(apiUrl("/sync"), { method: "POST", body: JSON.stringify(body) });
}

export async function postForm<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const json = await request<T>(apiUrl(path), { method: "POST", body: JSON.stringify(body) });
  return json.data as T;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "অজানা ত্রুটি";
}

export function errorFields(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.fields : {};
}
