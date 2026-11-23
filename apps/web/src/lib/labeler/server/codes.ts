/**
 * Access codes and session tokens. Codes carry 120 bits from the operating system CSPRNG,
 * written as six groups of four Crockford base32 characters. Only an HMAC-SHA-256 digest keyed
 * with LABELER_CODE_PEPPER reaches the database; session tokens are stored as SHA-256 hashes.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 24;

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** A fresh access code, for example 7K2M-QX9D-...; shown once and never stored in clear. */
export function generateCode(): string {
  const raw = base32(randomBytes(15)); // 15 bytes = 120 bits = 24 characters
  return raw.match(/.{4}/g)!.join("-");
}

/**
 * Predictable normalisation for pasted codes: case, spaces, hyphens, underscores and dots are
 * ignored, and the Crockford look-alikes O→0 and I/L→1 are folded. Returns null if the result
 * cannot be a code (callers still spend a rate-limit attempt on it).
 */
export function normaliseCode(input: string): string | null {
  if (typeof input !== "string" || input.length > 200) return null;
  const folded = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (folded.length !== CODE_LENGTH) return null;
  for (const char of folded) if (!ALPHABET.includes(char)) return null;
  return folded;
}

export function codeDigest(normalised: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`rr-labeler-code-v1:${normalised}`).digest("hex");
}

/** Digest for login: invalid shapes still produce a digest so every attempt looks the same. */
export function loginDigest(input: string, pepper: string): string {
  const normalised = normaliseCode(input);
  return codeDigest(normalised ?? `invalid:${input.slice(0, 200)}`, pepper);
}

export function clientBucket(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`rr-labeler-client-v1:${ip}`).digest("hex");
}

/** 256-bit session token for the cookie, independent of the access code. */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isSessionToken(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
