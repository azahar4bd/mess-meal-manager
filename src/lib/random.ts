import crypto from "node:crypto";

/** Cryptographically strong random token (session ids, api keys). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomDigits(len = 6): string {
  let out = "";
  while (out.length < len) out += crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  return out.slice(0, len);
}
