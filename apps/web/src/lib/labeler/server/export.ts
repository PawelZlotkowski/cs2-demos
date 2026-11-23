/**
 * Builds one reviewer's round-reviewer-notes-v1 file from the immutable source manifest and the
 * saved cloud review heads, for apps/api/app/annotation/transfer.py import_notes.
 *
 * - origin: the stable 32-hex cloud workspace ID; labeller: the immutable export handle.
 * - Every review key's latest head is exported, drafts and skips included, so a withdrawn
 *   completion is withdrawn locally too. Skipped work becomes a draft, never a completed note.
 * - revision: the database-generated, monotonically increasing revision number.
 * - Provenance (split and training permission) travels in demos, not inside each label, so a
 *   later permission change never alters an already-exported revision.
 */
import { NOTES_FORMAT } from "../manifest";

export interface ExportReview {
  revision: number;
  status: "draft" | "complete" | "skipped";
  notes: string;
  assessment: "good" | "mistake" | "uncertain" | null;
  language: "en" | "pl";
  issue: "wrong_footage" | "insufficient_context" | null;
  confirmFootage: boolean;
  savedAt: string;
  clip: {
    id: string;
    footageId: string;
    sha256: string;
    matchId: string;
    playerId: string;
    snapshotId: string;
    findingId: string;
    round: number;
    context: { finding: Record<string, unknown>; footage: Record<string, unknown>; batchId?: string };
  };
}

export interface ExportRaw {
  originId: string;
  account: { id: string; handle: string; displayName: string };
  demos: Record<string, { metadata: Record<string, unknown>; provenance: Record<string, unknown> }>;
  reviews: ExportReview[];
}

export const CLOUD_REVIEW_MODE = "cloud-independent-clip";

export function buildNotesExport(raw: ExportRaw, exportedAt: string) {
  const latest = new Map<string, ExportReview>();
  for (const review of raw.reviews) {
    const c = review.clip;
    // Keep grouped plays distinct from older notes about just their lead finding.
    const key = JSON.stringify([c.matchId, c.playerId, c.snapshotId, c.context.footage.reviewKey ?? c.findingId]);
    const current = latest.get(key);
    if (!current || review.revision > current.revision) latest.set(key, review);
  }
  const labels = [...latest.values()]
    .sort((a, b) => a.revision - b.revision)
    .map((review) => {
      const c = review.clip;
      const confirmed = review.status === "complete" && review.confirmFootage;
      const label = {
        status: review.status === "complete" ? "complete" : "draft",
        verdict: null,
        assessment: review.assessment,
        notes: review.notes,
        language: review.language,
        inputMode: "note",
        schemaVersion: 2,
        reviewMode: CLOUD_REVIEW_MODE,
        matchId: c.matchId,
        playerId: c.playerId,
        snapshotId: c.snapshotId,
        round: c.round,
        labeller: raw.account.handle,
        finding: c.context.finding,
        footage: {
          ...c.context.footage,
          id: c.footageId,
          state: "ready",
          demo: c.matchId,
          player: c.playerId,
          round: c.round,
          ...(c.context.batchId ? { batchId: c.context.batchId } : {}),
          snapshotId: c.snapshotId,
          alignmentConfirmed: confirmed,
        },
        cloud: { clipId: c.id, sha256: c.sha256, status: review.status, issue: review.issue },
      };
      return { kind: "clip", revision: review.revision, savedAt: review.savedAt, label };
    });
  const used = new Set(labels.map((entry) => entry.label.matchId));
  const demos = Object.fromEntries(Object.entries(raw.demos).filter(([id]) => used.has(id)));
  return { format: NOTES_FORMAT, origin: raw.originId, labeller: raw.account.handle, exportedAt, demos, labels };
}

