"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useAuth } from "./AuthProvider";

const ROLE_LABEL = { admin: "Admin", labeller: "Labeller", player: "Player" } as const;

/** Top bar, right: who is signed in, Settings, the admin panel for admins, sign out (A05). */
export function AccountMenu() {
  const { state, user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "/";

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!state) return null;
  if (state.authEnabled && !user) {
    return (
      <Link href="/signin" className="bar-link">
        Sign in
      </Link>
    );
  }
  if (!user) return null;

  async function signOut() {
    await api.logout().catch(() => undefined);
    window.location.assign("/signin");
  }

  const initials = user.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="acct" ref={ref}>
      <button
        type="button"
        className="acct-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={state.authEnabled ? `${user.displayName} (${ROLE_LABEL[user.role]})` : "Settings and admin"}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" width={24} height={24} />
        ) : (
          <span className="acct-initials" aria-hidden>
            {state.authEnabled ? initials : "·"}
          </span>
        )}
        <span className="acct-name hide-s">{state.authEnabled ? user.displayName : "Local"}</span>
      </button>
      {open ? (
        <div className="acct-menu" role="menu">
          {state.authEnabled ? (
            <p className="acct-who">
              <b>{user.displayName}</b>
              <span>{ROLE_LABEL[user.role]}</span>
            </p>
          ) : (
            <p className="acct-who">
              <b>This PC</b>
              <span>Accounts are off</span>
            </p>
          )}
          <Link role="menuitem" href="/settings">
            Settings
          </Link>
          {user.role === "admin" ? (
            <Link role="menuitem" href="/admin">
              Admin panel
            </Link>
          ) : null}
          {user.role === "labeller" ? (
            <Link role="menuitem" href="/admin/lab">
              Lab
            </Link>
          ) : null}
          {state.authEnabled ? (
            <button type="button" role="menuitem" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
