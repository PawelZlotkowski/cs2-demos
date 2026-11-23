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
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname() ?? "/";

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      } else if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
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
      <Link href="/signin" className="acct-btn glass" aria-label="Sign in" title="Sign in">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M2.5 13.5a5.5 5.5 0 0 1 11 0" />
        </svg>
      </Link>
    );
  }
  if (!user) return null;

  async function signOut() {
    await api.logout().catch(() => undefined);
    window.location.assign("/signin");
  }

  const initial = Array.from(user.displayName.trim())[0]?.toLocaleUpperCase();
  const label = state.authEnabled ? `Account for ${user.displayName}` : "Local account";

  return (
    <div
      className="acct"
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="acct-btn glass"
        aria-label={label}
        aria-controls={open ? "account-links" : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={label}
      >
        {initial}
      </button>
      {open ? (
        <div className="acct-menu" id="account-links">
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
          <Link href="/settings">
            Settings
          </Link>
          {user.role === "admin" ? (
            <Link href="/admin">
              Admin panel
            </Link>
          ) : null}
          {user.role === "labeller" ? (
            <Link href="/admin/lab">
              Lab
            </Link>
          ) : null}
          {state.authEnabled ? (
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
