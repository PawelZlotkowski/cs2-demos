import type {
  ABPair,
  Bookmark,
  BookmarkRequest,
  DatasetPage,
  EvalSummary,
  GoodExamples,
  KnowledgeNoteRequest,
  KnowledgeRow,
  LabelsSummary,
  MapZone,
  MatchRow,
  MomentPicks,
  PickScore,
  PracticePlan,
  ProgressResponse,
  RoundLabel,
  AskEvent,
  CoachAskRequest,
  CoachedPlayer,
  Features,
  SystemStatus,
  TraceDetail,
  TracePage,
  AskRequest,
  CoachLanguage,
  ClipManifest,
  MomentClip,
  CoachRequest,
  CoachResponse,
  EventsPage,
  Finding,
  FindingKind,
  KnowledgePassage,
  Match,
  Moment,
  MomentExplanation,
  PatternsResponse,
  ReviewWrapUp,
  RoundClip,
  RoundReplay,
  RoundStats,
  RoundSummary,
  SelectedMoment,
  StatusResponse,
  UploadResponse,
} from "@/lib/contracts";

/** Browser: host-published API. Server (SSR): compose service name when set. */
const API_URL =
  typeof window === "undefined"
    ? (process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://127.0.0.1:8000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  baseUrl: API_URL,
  health: () => request<{ status: string }>("/health"),
  /** XHR rather than fetch, because fetch cannot report upload progress. */
  upload: (file: File, onProgress?: (sent: number, total: number) => void) =>
    new Promise<UploadResponse>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/matches/upload`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded, e.total);
      };
      xhr.onload = () => {
        const body = xhr.response as (UploadResponse & { detail?: string }) | null;
        if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
        else reject(new Error(body?.detail ?? (xhr.statusText || "Unable to upload the demo. Check it is a .dem or .dem.zst file and try again.")));
      };
      xhr.onerror = () => reject(new Error("The upload stopped. Check that the API is running."));
      xhr.send(form);
    }),
  getMatch: (id: string) => request<Match>(`/matches/${id}`),
  getStatus: (id: string) => request<StatusResponse>(`/matches/${id}/status`),
  getRounds: (id: string) => request<RoundSummary[]>(`/matches/${id}/rounds`),
  getRound: (matchId: string, roundId: string) =>
    request<RoundSummary>(`/matches/${matchId}/rounds/${roundId}`),
  getRoundReplay: (matchId: string, roundId: string) =>
    request<RoundReplay>(`/matches/${matchId}/rounds/${roundId}/replay`),
  getClips: (matchId: string) => request<ClipManifest>(`/matches/${matchId}/clips`),
  getRoundClip: (matchId: string, roundId: string) =>
    request<RoundClip>(`/matches/${matchId}/clips/${roundId}`),
  clipUrl: (matchId: string, roundId: string) =>
    `${API_URL}/matches/${matchId}/clips/${roundId}.mp4`,
  getEvents: (
    matchId: string,
    opts?: { fromTick?: number; toTick?: number; offset?: number; limit?: number },
  ) => {
    const q = new URLSearchParams();
    if (opts?.fromTick != null) q.set("fromTick", String(opts.fromTick));
    if (opts?.toTick != null) q.set("toTick", String(opts.toTick));
    if (opts?.offset != null) q.set("offset", String(opts.offset));
    if (opts?.limit != null) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return request<EventsPage>(`/matches/${matchId}/events${qs ? `?${qs}` : ""}`);
  },
  selectPlayer: (matchId: string, playerId: string, language: CoachLanguage = "en") =>
    request<StatusResponse>(`/matches/${matchId}/player`, {
      method: "POST",
      body: JSON.stringify({ playerId, language }),
    }),
  getFindings: (
    matchId: string,
    playerId: string,
    opts?: { round?: number; kind?: FindingKind; detector?: string },
  ) => {
    const q = new URLSearchParams();
    if (opts?.round != null) q.set("round", String(opts.round));
    if (opts?.kind) q.set("kind", opts.kind);
    if (opts?.detector) q.set("detector", opts.detector);
    const qs = q.toString();
    return request<Finding[]>(
      `/matches/${matchId}/players/${playerId}/findings${qs ? `?${qs}` : ""}`,
    );
  },
  getRoundStats: (matchId: string, playerId: string) =>
    request<RoundStats[]>(`/matches/${matchId}/players/${playerId}/round-stats`),
  getPlayerMoments: (matchId: string, playerId: string) =>
    request<SelectedMoment[]>(`/matches/${matchId}/players/${playerId}/moments`),
  getMoments: (id: string) => request<Moment[]>(`/matches/${id}/moments`),
  getMoment: (matchId: string, momentId: string) =>
    request<Moment>(`/matches/${matchId}/moments/${momentId}`),
  coach: (matchId: string, body: CoachRequest) =>
    request<CoachResponse>(`/matches/${matchId}/coach`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patterns: () => request<PatternsResponse>("/users/me/patterns"),
  getMomentExplanation: (matchId: string, playerId: string, momentId: string, lang: CoachLanguage) =>
    request<MomentExplanation>(
      `/matches/${matchId}/players/${playerId}/moments/${momentId}/explanation?lang=${lang}`,
    ),
  explainRound: (matchId: string, playerId: string, round: number, language: CoachLanguage) =>
    request<MomentExplanation>(`/matches/${matchId}/players/${playerId}/rounds/${round}/explain`, {
      method: "POST",
      body: JSON.stringify({ language }),
    }),
  getReviewSummary: (matchId: string, playerId: string, lang: CoachLanguage) =>
    request<MomentExplanation>(`/matches/${matchId}/players/${playerId}/review/summary?lang=${lang}`),
  getReviewWrapUp: (matchId: string, playerId: string, lang: CoachLanguage) =>
    request<ReviewWrapUp>(`/matches/${matchId}/players/${playerId}/review/wrapup?lang=${lang}`),
  getPlayerClips: (matchId: string, playerId: string) =>
    request<MomentClip[]>(`/matches/${matchId}/players/${playerId}/clips`),
  retryPlayerClip: (matchId: string, playerId: string, clipId: string) =>
    request<MomentClip>(`/matches/${matchId}/players/${playerId}/clips/${clipId}/retry`, { method: "POST" }),
  /** Clip URLs from the API are paths; the browser needs the API origin. */
  mediaUrl: (path: string) => `${API_URL}${path}`,
  getKnowledge: (id: string) => request<KnowledgePassage>(`/knowledge/${id}`),
  /** Ask over server-sent events: `step` per tool call, then one verified `answer`. */
  ask: (
    matchId: string,
    playerId: string,
    body: AskRequest,
    onEvent: (e: AskEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => streamAsk(`/matches/${matchId}/players/${playerId}/ask`, body, onEvent, signal),
  /** Coach page: the same events, across all the player's matches. */
  askAcross: (playerId: string, body: CoachAskRequest, onEvent: (e: AskEvent) => void, signal?: AbortSignal) =>
    streamAsk(`/players/${playerId}/ask`, body, onEvent, signal),
  features: () => request<Features>("/features"),
  getPlayers: () => request<CoachedPlayer[]>("/players"),
  getSystem: () => request<SystemStatus>("/system"),
  getTraces: (opts?: { job?: string; matchId?: string; source?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts ?? {})) if (v != null && v !== "") q.set(k, String(v));
    const qs = q.toString();
    return request<TracePage>(`/lab/traces${qs ? `?${qs}` : ""}`);
  },
  getTrace: (id: string) => request<TraceDetail>(`/lab/traces/${encodeURIComponent(id)}`),

  // Studio Notes (R08) and "done well" (R15)
  getBookmarks: (matchId: string) => request<Bookmark[]>(`/matches/${matchId}/bookmarks`),
  addBookmark: (matchId: string, body: BookmarkRequest) =>
    request<Bookmark>(`/matches/${matchId}/bookmarks`, { method: "POST", body: JSON.stringify(body) }),
  deleteBookmark: (matchId: string, id: string) =>
    request<void>(`/matches/${matchId}/bookmarks/${id}`, { method: "DELETE" }),
  explainBookmark: (matchId: string, playerId: string, id: string, language: CoachLanguage) =>
    request<MomentExplanation>(`/matches/${matchId}/players/${playerId}/bookmarks/${id}/explain`, {
      method: "POST",
      body: JSON.stringify({ language }),
    }),
  doneWell: (matchId: string, playerId: string, findingId: string) =>
    request<GoodExamples>(`/matches/${matchId}/players/${playerId}/findings/${findingId}/done-well`),

  // Coach page Plan (R09) and Knowledge (R12)
  getPlan: (playerId: string, lang: CoachLanguage) => request<PracticePlan>(`/players/${playerId}/plan?lang=${lang}`),
  newPlan: (playerId: string, lang: CoachLanguage) =>
    request<PracticePlan>(`/players/${playerId}/plan?lang=${lang}`, { method: "POST" }),
  tickPlan: (playerId: string, detector: string, done: boolean, lang: CoachLanguage) =>
    request<PracticePlan>(`/players/${playerId}/plan/${detector}?lang=${lang}`, {
      method: "PUT",
      body: JSON.stringify({ done }),
    }),
  browseKnowledge: (opts: { map?: string; zone?: string; q?: string }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts)) if (v) q.set(k, v);
    return request<KnowledgeRow[]>(`/knowledge?${q.toString()}`);
  },
  getZones: (map: string) => request<MapZone[]>(`/maps/${map}/zones`),
  flagPassage: (id: string, note: string) =>
    request<void>(`/knowledge/${id}/flag`, { method: "POST", body: JSON.stringify({ note }) }),
  addKnowledgeNote: (body: KnowledgeNoteRequest) =>
    request<KnowledgeRow>("/knowledge/notes", { method: "POST", body: JSON.stringify(body) }),

  // Matches and Progress (R13, R17)
  listMatches: () => request<MatchRow[]>("/matches"),
  rerunCoach: (matchId: string, language: CoachLanguage) =>
    request<StatusResponse>(`/matches/${matchId}/rerun`, { method: "POST", body: JSON.stringify({ language }) }),
  getProgress: (playerId: string) => request<ProgressResponse>(`/players/${playerId}/progress`),

  // Lab: Labels (R07), Evaluation (R10), Dataset (R11)
  getLabelsSummary: (a?: string, b?: string) => {
    const q = new URLSearchParams();
    if (a) q.set("a", a);
    if (b) q.set("b", b);
    return request<LabelsSummary>(`/lab/labels/summary?${q.toString()}`);
  },
  getRoundLabels: (matchId: string, playerId: string, labeller: string) =>
    request<RoundLabel[]>(`/lab/labels/${matchId}/${playerId}?labeller=${encodeURIComponent(labeller)}`),
  saveRoundLabel: (body: RoundLabel) =>
    request<RoundLabel>("/lab/labels", { method: "PUT", body: JSON.stringify(body) }),
  getPicks: (matchId: string, playerId: string, labeller: string) =>
    request<{ picks: MomentPicks | null; score: PickScore | null }>(
      `/lab/picks/${matchId}/${playerId}?labeller=${encodeURIComponent(labeller)}`,
    ),
  savePicks: (body: MomentPicks) =>
    request<{ picks: MomentPicks; score: PickScore }>("/lab/picks", { method: "PUT", body: JSON.stringify(body) }),
  getEval: () => request<EvalSummary>("/lab/eval"),
  getPair: () => request<ABPair | null>("/lab/eval/pair"),
  ratePair: (a: string, b: string, winner: "a" | "b" | "tie", rater?: string) =>
    request<void>("/lab/eval/rate", { method: "POST", body: JSON.stringify({ a, b, winner, rater }) }),
  getDataset: (opts?: { job?: string; pending?: boolean; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts ?? {})) if (v != null && v !== "" && v !== false) q.set(k, String(v));
    return request<DatasetPage>(`/lab/dataset?${q.toString()}`);
  },
  reviewExample: (id: string, verdict: "accept" | "edit" | "reject", text?: string) =>
    request<void>(`/lab/dataset/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ verdict, text }),
    }),
  exportDataset: () =>
    request<{ folder: string; counts: Record<string, number> }>("/lab/dataset/export", { method: "POST" }),
};

async function streamAsk(
  path: string,
  body: AskRequest | CoachAskRequest,
  onEvent: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const b = (await res.json()) as { detail?: string };
      if (b.detail) detail = b.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || "The coach did not answer.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !done });
    let cut = buf.indexOf("\n\n");
    while (cut >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const parsed = parseSseBlock(block);
      if (parsed) onEvent(parsed);
      cut = buf.indexOf("\n\n");
    }
    if (done) break;
  }
}

export function parseSseBlock(block: string): AskEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) } as AskEvent;
  } catch {
    return null;
  }
}
