/**
 * Server-component helpers for /label pages: load data through the same session-checked
 * database functions as the API, and turn auth failures into redirects.
 */
import { notFound, redirect } from "next/navigation";
import { ConfigurationError, isLabelerMode, missingSettings } from "./config";
import { LabelerError, rpc } from "./db";
import { sessionTokenHash } from "./session";

export function requireLabelerMode(): void {
  if (!isLabelerMode()) notFound();
}

export function configurationProblem(): string[] {
  return missingSettings();
}

export async function pageRpc<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  requireLabelerMode();
  if (missingSettings().length) redirect("/label/login");
  const tokenHash = await sessionTokenHash();
  if (!tokenHash) redirect("/label/login");
  try {
    return await rpc<T>(name, { tokenHash, ...payload });
  } catch (error) {
    if (error instanceof LabelerError) {
      if (error.status === 401) redirect("/label/login?ended=1");
      if (error.status === 403) redirect("/label");
      if (error.status === 404) notFound();
    }
    if (error instanceof ConfigurationError) redirect("/label/login");
    throw error;
  }
}
