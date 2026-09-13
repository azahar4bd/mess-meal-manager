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
    throw new ApiError(`সার্ভার থেকে অপ্রত্যাশিত উত্তর (HTTP ${res.status})`, "bad-response", res.status);
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
  const json = await request<T>(`/api${path}${suffix}`);
  return (json.data ?? json) as T;
}

export async function apiPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const json = await request<T>(`/api${path}`, { method: "POST", body: JSON.stringify(body) });
  return (json.data ?? json) as T;
}

/** POST /api/mess with an action — the main data channel */
export async function mess<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const json = await request<{ action: string; data: T }>("/mess", {
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
  return request("/sync", { method: "POST", body: JSON.stringify(body) });
}

export async function postForm<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const json = await request<T>(path, { method: "POST", body: JSON.stringify(body) });
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
