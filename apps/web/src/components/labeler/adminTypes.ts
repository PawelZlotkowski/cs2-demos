export interface AdminAccount {
  id: string;
  handle: string;
  displayName: string;
  role: "admin" | "reviewer";
  status: "active" | "inactive";
  codeIssuedAt: string | null;
  createdAt: string;
  activeSessions: number;
  lastSeenAt: string | null;
  assignedClips: number;
  complete: number;
  drafts: number;
  skipped: number;
  issues: number;
}

export interface AdminCollectionSummary {
  id: string;
  name: string;
  status: "draft" | "published" | "archived";
  createdAt: string;
  clips: number;
  ready: number;
  published: number;
  bytes: number;
  maps: string[];
  assignees: string[];
}

export interface Overview {
  me: { id: string; handle: string; displayName: string; role: "admin" };
  originId: string;
  storage: { readyBytes: number; readyClips: number; totalClips: number; reservedBytes: number; openUploads: number };
  accounts: AdminAccount[];
  collections: AdminCollectionSummary[];
  limits: { maxClipBytes: number; maxTotalBytes: number; maxClips: number; maxOpenUploads: number; partSize: number };
  bucket: string;
  siteOrigin: string;
}

export interface AdminClip {
  id: string;
  position: number;
  footageId: string;
  sha256: string;
  bytes: number;
  mediaState: "pending" | "ready";
  publishedAt: string | null;
  readyAt: string | null;
  map: string;
  demoId: string;
  demoFile: string;
  playerId: string;
  playerName: string;
  round: number;
  findingId: string;
  detector: string | null;
  durationSec: number | null;
  upload: null | { id: string; status: string; partCount: number; createdAt: string; error: string | null; partsRecorded: number };
  reviews: { complete: number; draft: number; skipped: number; issues: number };
}

export interface CollectionDetail {
  collection: { id: string; name: string; status: "draft" | "published" | "archived"; createdAt: string; publishedAt: string | null; archivedAt: string | null };
  assignments: Array<{ accountId: string; assignedAt: string }>;
  clips: AdminClip[];
}

export interface AdminNote {
  accountId: string;
  handle: string;
  displayName: string;
  clipId: string;
  map: string;
  round: number;
  demoFile: string;
  playerName: string;
  findingId: string;
  detector: string | null;
  revision: number;
  status: "draft" | "complete" | "skipped";
  notes: string;
  assessment: "good" | "mistake" | "uncertain" | null;
  language: "en" | "pl";
  issue: "wrong_footage" | "insufficient_context" | null;
  savedAt: string;
}

export function when(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function assessmentText(value: AdminNote["assessment"]): string {
  return value === "good" ? "Good play" : value === "mistake" ? "Needs improvement" : value === "uncertain" ? "Unsure" : "";
}

export function issueText(value: AdminNote["issue"]): string {
  return value === "wrong_footage" ? "Wrong player or event" : value === "insufficient_context" ? "Not enough context" : "";
}
