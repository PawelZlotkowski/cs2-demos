/** Small formatters shared by the admin panel and Settings. */

export function bytes(n: number | null | undefined): string {
  if (n == null) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** "27 Sep, 14:05" from an ISO string or epoch seconds. */
export function when(ts: string | number | null | undefined): string {
  if (ts == null || ts === "") return "–";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "3 min ago" for recent times, else the date. */
export function ago(ts: string | number | null | undefined): string {
  if (ts == null || ts === "") return "never";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  const s = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(s)) return String(ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return when(ts);
}

export function errorText(e: unknown, fallback = "Something went wrong."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
