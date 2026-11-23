/**
 * round-reviewer-clips-v1: the folder the local labeller writes with "Export clips for web".
 * Mirrors ClipManifest in apps/api/app/models/annotation.py (edit the Pydantic model first).
 * Shared by the admin browser (pre-upload checks) and the server (import validation).
 */
import { z } from "zod";

export const CLIP_MANIFEST_FORMAT = "round-reviewer-clips-v1";
export const NOTES_FORMAT = "round-reviewer-notes-v1";

export const DEMO_ID = /^demo-[a-f0-9]{64}$/;
export const HEX32 = /^[a-f0-9]{32}$/;
export const HEX64 = /^[a-f0-9]{64}$/;
export const HANDLE = /^[A-Za-z0-9_]{1,40}$/;

export const provenanceSchema = z
  .object({
    source: z.string().max(500),
    sourceMatchId: z.string().max(200),
    split: z.enum(["unassigned", "train", "val", "test"]),
    trainingPermitted: z.boolean(),
  })
  .strict();

export const playerSchema = z
  .object({
    id: z.string().regex(/^\d{1,20}$/),
    name: z.string().max(200),
    team: z.string().max(20).optional(),
  })
  .passthrough();

export const demoMetadataSchema = z
  .object({
    id: z.string().regex(DEMO_ID),
    sha256: z.string().regex(HEX64),
    filename: z.string().min(1).max(250),
    map: z.enum(["de_ancient", "de_anubis"]),
    players: z.array(playerSchema).min(1).max(64),
    parserVersion: z.string().max(50).optional(),
    originalSha256: z.string().regex(HEX64).optional(),
  })
  .strict()
  .refine((m) => m.sha256 === m.id.slice(5), "The demo identity must be its decompressed SHA-256.");

export const findingSchema = z
  .object({
    id: z.string().regex(/^F\d+$/),
    detector: z.string().min(1).max(60),
    round: z.number().int().min(1),
    t: z.number().finite().nonnegative(),
    evidence: z.record(z.unknown()),
  })
  .passthrough();

export const footageContextSchema = z
  .object({
    source: z.string().max(40),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().nonnegative(),
    duration: z.number().finite().positive(),
    startTick: z.number().int().nonnegative(),
    endTick: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    codec: z.literal("h264"),
    sha256: z.string().regex(HEX64),
    bytes: z.number().int().positive(),
    anchor: z.number().finite().nonnegative().nullable().optional(),
    alignmentConfirmed: z.boolean(),
    findings: z.array(findingSchema).min(1).max(2000).nullable().optional(),
    reviewKey: z.string().regex(/^F\d+(\+F\d+)*$/).max(20000).nullable().optional(),
  })
  .passthrough();

// Compare evidence independently of JSON property order (also used by Python validation).
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const manifestClipSchema = z
  .object({
    footageId: z.string().regex(HEX32),
    path: z.string().regex(/^clips\/[a-f0-9]{32}\.mp4$/),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(HEX64),
    contentType: z.literal("video/mp4"),
    matchId: z.string().regex(DEMO_ID),
    playerId: z.string().regex(/^\d{1,20}$/),
    snapshotId: z.string().min(1).max(200),
    round: z.number().int().min(1),
    batchId: z.string().regex(HEX32),
    finding: findingSchema,
    footage: footageContextSchema,
  })
  .strict()
  .refine((c) => c.finding.round === c.round, "The finding and clip round disagree.")
  .refine((c) => {
    const { findings, reviewKey, start, end } = c.footage;
    if (findings == null && reviewKey == null) return true;
    if (!findings?.length) return false;
    const ids = findings.map((f) => f.id);
    return new Set(ids).size === ids.length && reviewKey === [...ids].sort().join("+")
      && canonical(findings[0]) === canonical(c.finding)
      && findings.every((f) => f.round === c.round && f.t >= start - 0.05 && f.t <= end + 0.05);
  }, "Grouped findings must match their review key, lead finding, round and recorded context.")
  .refine((c) => c.footage.sha256 === c.sha256 && c.footage.bytes === c.bytes, "Footage metadata disagrees with the file entry.");

const demosSchema = z.record(
  z.string().regex(DEMO_ID),
  z.object({ metadata: demoMetadataSchema, provenance: provenanceSchema }).strict(),
);

export const clipManifestSchema = z
  .object({
    format: z.literal(CLIP_MANIFEST_FORMAT),
    exportedAt: z.string().max(40),
    workspace: z.string().regex(HEX32).nullable(),
    demos: demosSchema,
    clips: z.array(manifestClipSchema).max(2000),
  })
  .strict()
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    for (const [index, clip] of m.clips.entries()) {
      const demo = m.demos[clip.matchId];
      if (!demo) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clips", index], message: "Clip names a demo missing from the manifest." });
        continue;
      }
      if (demo.metadata.id !== clip.matchId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["demos", clip.matchId], message: "Demo key and metadata disagree." });
      }
      if (!demo.metadata.players.some((p) => p.id === clip.playerId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clips", index], message: "Clip names a player outside its demo." });
      }
      if (seen.has(clip.footageId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clips", index], message: "Duplicate clip in the manifest." });
      }
      seen.add(clip.footageId);
    }
  });

export type ClipManifest = z.infer<typeof clipManifestSchema>;
export type ManifestClip = z.infer<typeof manifestClipSchema>;
export type ManifestDemo = ClipManifest["demos"][string];
export type Provenance = z.infer<typeof provenanceSchema>;

/** The import request: one batch of manifest entries plus only the demos they reference. */
export const importBatchSchema = z
  .object({
    demos: demosSchema,
    clips: z.array(manifestClipSchema).min(1).max(25),
  })
  .strict()
  .superRefine((b, ctx) => {
    for (const [index, clip] of b.clips.entries()) {
      const demo = b.demos[clip.matchId];
      if (!demo || !demo.metadata.players.some((p) => p.id === clip.playerId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clips", index], message: "Clip names a demo or player outside this batch." });
      }
    }
  });
export type ImportBatch = z.infer<typeof importBatchSchema>;

/** Map label shown to people: de_ancient → Ancient. */
export function mapName(map: string): string {
  if (map === "de_ancient") return "Ancient";
  if (map === "de_anubis") return "Anubis";
  return map.replace(/^de_/, "");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
