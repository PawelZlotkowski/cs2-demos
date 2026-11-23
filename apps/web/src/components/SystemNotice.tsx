"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ServiceIsland } from "@/components/StatusIsland";
import { api } from "@/lib/api/client";
import type { SystemStatus } from "@/lib/contracts";

const SystemContext = createContext<SystemStatus | null>(null);
export const useSystemStatus = () => useContext(SystemContext);

export function SystemProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const id = user?.id;
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    setStatus(null);
    if (!id) return;
    let live = true;
    let pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await api.getSystem();
        if (live) setStatus(result);
      } catch {
        if (live) setStatus(null);
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [id]);

  return <SystemContext.Provider value={status}>{children}</SystemContext.Provider>;
}

export function ModelNotice() {
  const model = useSystemStatus()?.checks.find((c) => c.name === "llm");
  if (!model || model.state === "ok") return null;
  return <ServiceIsland label={model.state === "off" ? "Coach model is off" : "Coach model is unavailable"}
    detail="New explanations use the finding templates." />;
}

export function SystemNotice() {
  const status = useSystemStatus();
  const { isAdmin } = useAuth();
  const bad = status?.checks.filter((c) => c.state === "problem");
  if (!isAdmin || !bad?.length) return null;
  const label = bad.map((c) => LABELS[c.name]).join(" and ") + " unavailable";
  return <Link className="sys-notice" href="/settings#system" aria-label={label + ". Open system checks."} title={label}>
    <span className="sys-dot" aria-hidden="true" /><span className="sys-text">{label}</span>
  </Link>;
}

export const LABELS: Record<string, string> = {
  llm: "Coach model", mcp: "Coach tools", csdm: "Clip recording", knowledge: "Knowledge base", traces: "Run log",
};
