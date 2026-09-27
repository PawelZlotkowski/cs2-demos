"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export const SECTIONS: { href: string; label: string; group: string }[] = [
  { href: "/admin", label: "Overview", group: "Control" },
  { href: "/admin/jobs", label: "Jobs", group: "Control" },
  { href: "/admin/model", label: "Model and services", group: "Control" },
  { href: "/admin/settings", label: "Settings", group: "Control" },
  { href: "/admin/users", label: "Users", group: "People" },
  { href: "/admin/invites", label: "Invites", group: "People" },
  { href: "/admin/study", label: "Study", group: "People" },
  { href: "/admin/matches", label: "Matches", group: "Data" },
  { href: "/admin/knowledge", label: "Knowledge", group: "Data" },
  { href: "/admin/lab", label: "Lab", group: "Data" },
  { href: "/admin/storage", label: "Storage and backup", group: "Data" },
  { href: "/admin/security", label: "Security", group: "Safety" },
  { href: "/admin/audit", label: "Audit log", group: "Safety" },
];

/**
 * The admin panel's frame (doc 30 §5.1): its own sidebar in the light chrome, under the app's
 * top bar. The API checks the role on every /admin route; this only decides what to draw.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const { user, state } = useAuth();
  const labOnly = user?.role === "labeller";
  const allowed = user?.role === "admin" || (labOnly && pathname.startsWith("/admin/lab"));

  if (state && !allowed) {
    return (
      <main className="main" id="content">
        <h1>Admin</h1>
        <p className="empty">
          The admin panel is for admins. {labOnly ? <Link href="/admin/lab">Open the Lab</Link> : <Link href="/">Go home</Link>}
        </p>
      </main>
    );
  }

  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  const current = (href: string) =>
    (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined;

  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Admin">
        <p className="admin-title">{labOnly ? "Lab" : "Admin"}</p>
        {labOnly ? (
          <Link href="/admin/lab" aria-current="page">
            Lab
          </Link>
        ) : (
          groups.map((g) => (
            <div key={g} className="admin-group">
              <span className="admin-group-h">{g}</span>
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <Link key={s.href} href={s.href} aria-current={current(s.href)}>
                  {s.label}
                </Link>
              ))}
            </div>
          ))
        )}
        {state && !state.authEnabled ? (
          <p className="admin-note">
            Accounts are off, so this PC is the admin. Set <code>RR_AUTH_ENABLED=true</code> to add sign-in.
          </p>
        ) : null}
      </nav>
      <div className="admin-body">{children}</div>
    </div>
  );
}
