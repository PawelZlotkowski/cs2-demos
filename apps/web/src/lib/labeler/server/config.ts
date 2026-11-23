/**
 * Server-only configuration for RR_WEB_MODE=clip-labeller. Secrets never use NEXT_PUBLIC_.
 * Import this module only from route handlers, server components and scripts.
 */

export const PART_SIZE = 8 * 1024 * 1024;
export const PLAYBACK_SECONDS = 300;
export const PART_URL_SECONDS = 600;
/** R2 discards incomplete multipart uploads after seven days; restart a day earlier. */
export const UPLOAD_EXPIRY_SECONDS = 6 * 24 * 3600;

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

export function isLabelerMode(): boolean {
  return process.env.RR_WEB_MODE === "clip-labeller";
}

export interface LabelerConfig {
  siteOrigin: string;
  /** Local development over http: cookies without Secure, a non-__Host- name. */
  localDevelopment: boolean;
  allowedOrigins: string[];
  pepper: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  /** Local development and tests only: a direct Postgres URL instead of the Supabase Data API. */
  databaseUrl: string;
  r2: { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string };
  limits: {
    maxClipBytes: number;
    maxTotalBytes: number;
    maxClips: number;
    maxOpenUploads: number;
    partSize: number;
  };
  sessions: { reviewerSeconds: number; adminSeconds: number };
  /** Signed playback URL lifetime: five minutes; local development may shorten it to test renewal. */
  playbackSeconds: number;
  login: { windowSeconds: number; ipLimit: number; globalLimit: number };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

let cached: LabelerConfig | null = null;

export function labelerConfig(): LabelerConfig {
  if (cached) return cached;
  const missing = missingSettings();
  if (missing.length) {
    throw new ConfigurationError(missing);
  }
  const site = new URL(process.env.LABELER_SITE_URL!);
  const localDevelopment = site.protocol === "http:" && LOCAL_HOSTS.has(site.hostname);
  if (!localDevelopment && site.protocol !== "https:") {
    throw new Error("LABELER_SITE_URL must use https outside local development.");
  }
  const allowedOrigins = [site.origin];
  // Named preview deployments may answer on their own URLs; production accepts only its site.
  if (process.env.VERCEL_ENV === "preview") {
    for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
      if (host) allowedOrigins.push(`https://${host}`);
    }
  }
  const databaseUrl = process.env.LABELER_DATABASE_URL ?? "";
  if (databaseUrl && (!localDevelopment || process.env.VERCEL)) {
    throw new Error("LABELER_DATABASE_URL is for local development only. Use SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }
  const pepper = process.env.LABELER_CODE_PEPPER!;
  if (Buffer.byteLength(pepper, "utf8") < 32) {
    throw new Error("LABELER_CODE_PEPPER must contain at least 32 bytes of random data.");
  }
  cached = {
    siteOrigin: site.origin,
    localDevelopment,
    allowedOrigins,
    pepper,
    supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/+$/, ""),
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
    databaseUrl,
    r2: {
      endpoint: process.env.R2_ENDPOINT!.replace(/\/+$/, ""),
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      bucket: process.env.R2_BUCKET!,
    },
    limits: {
      maxClipBytes: integer("LABELER_MAX_CLIP_BYTES", 256 * 1024 * 1024, PART_SIZE, 5 * 1024 ** 3),
      maxTotalBytes: integer("LABELER_MAX_TOTAL_BYTES", 8 * 1024 ** 3, 1, 1024 ** 4),
      maxClips: integer("LABELER_MAX_CLIPS", 1500, 1, 1_000_000),
      maxOpenUploads: integer("LABELER_MAX_OPEN_UPLOADS", 12, 1, 1000),
      partSize: PART_SIZE,
    },
    sessions: {
      reviewerSeconds: integer("LABELER_REVIEWER_SESSION_HOURS", 7 * 24, 1, 30 * 24) * 3600,
      adminSeconds: integer("LABELER_ADMIN_SESSION_HOURS", 12, 1, 7 * 24) * 3600,
    },
    playbackSeconds: localDevelopment ? integer("LABELER_DEV_PLAYBACK_SECONDS", PLAYBACK_SECONDS, 10, PLAYBACK_SECONDS) : PLAYBACK_SECONDS,
    login: {
      windowSeconds: 600,
      ipLimit: integer("LABELER_LOGIN_LIMIT_PER_CLIENT", 20, 1, 10_000),
      globalLimit: integer("LABELER_LOGIN_LIMIT_GLOBAL", 500, 1, 100_000),
    },
  };
  return cached;
}

/** Names of required settings that are absent. Values are never echoed. */
export function missingSettings(): string[] {
  const names = ["LABELER_SITE_URL", "LABELER_CODE_PEPPER", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
  const missing = names.filter((name) => !process.env[name]);
  if (!process.env.LABELER_DATABASE_URL) {
    for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
      if (!process.env[name]) missing.push(name);
    }
  }
  return missing;
}

export class ConfigurationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`The clip labeller is missing server settings: ${missing.join(", ")}.`);
    this.name = "ConfigurationError";
  }
}

/** Test hook: forget cached settings after changing process.env. */
export function resetLabelerConfig(): void {
  cached = null;
}
