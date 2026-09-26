import type {
  CoachRequest,
  CoachResponse,
  EventsPage,
  Match,
  Moment,
  PatternsResponse,
  RoundReplay,
  RoundSummary,
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
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<UploadResponse>("/matches/upload", { method: "POST", body: form });
  },
  getMatch: (id: string) => request<Match>(`/matches/${id}`),
  getStatus: (id: string) => request<StatusResponse>(`/matches/${id}/status`),
  getRounds: (id: string) => request<RoundSummary[]>(`/matches/${id}/rounds`),
  getRound: (matchId: string, roundId: string) =>
    request<RoundSummary>(`/matches/${matchId}/rounds/${roundId}`),
  getRoundReplay: (matchId: string, roundId: string) =>
    request<RoundReplay>(`/matches/${matchId}/rounds/${roundId}/replay`),
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
  getMoments: (id: string) => request<Moment[]>(`/matches/${id}/moments`),
  getMoment: (matchId: string, momentId: string) =>
    request<Moment>(`/matches/${matchId}/moments/${momentId}`),
  coach: (matchId: string, body: CoachRequest) =>
    request<CoachResponse>(`/matches/${matchId}/coach`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patterns: () => request<PatternsResponse>("/users/me/patterns"),
};
