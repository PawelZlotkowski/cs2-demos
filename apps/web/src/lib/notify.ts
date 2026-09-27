"use client";

/** Review-ready browser notification (doc 29 §4.6, R18): once per match, only while the tab is in the background. */

const KEY = (id: string) => `rr.notified.${id}`;

export function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission(): NotificationPermission | "unsupported" {
  return canNotify() ? Notification.permission : "unsupported";
}

export async function askToNotify(): Promise<NotificationPermission | "unsupported"> {
  if (!canNotify()) return "unsupported";
  return Notification.permission === "default" ? Notification.requestPermission() : Notification.permission;
}

/** True when a notification went out (the caller then leaves the page as it is). */
export function notifyReviewReady(matchId: string, body: string): boolean {
  if (!canNotify() || Notification.permission !== "granted" || document.visibilityState === "visible") return false;
  try {
    if (window.localStorage.getItem(KEY(matchId))) return false;
    window.localStorage.setItem(KEY(matchId), "1");
  } catch {
    /* storage blocked: still notify, at worst twice */
  }
  const n = new Notification("Your review is ready", { body, tag: `rr-review-${matchId}` });
  n.onclick = () => {
    window.focus();
    n.close();
  };
  return true;
}
