import type {
  AskEvent,
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
        else reject(new Error(body?.detail ?? (xhr.statusText || "Upload failed.")));
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
  ask: async (
    matchId: string,
    playerId: string,
    body: AskRequest,
    onEvent: (e: AskEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const res = await fetch(`${API_URL}/matches/${matchId}/players/${playerId}/ask`, {
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
  },
};

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
