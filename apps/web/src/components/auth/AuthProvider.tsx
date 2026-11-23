"use client";

import { LoadingState } from "@/components/LoadingState";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { UNAUTHORIZED_EVENT, api } from "@/lib/api/client";
import type { AuthState, UserOut } from "@/lib/contracts";
import { pullSettings } from "@/lib/prefs";

interface AuthContextValue {
  /** null until the first answer from the API */
  state: AuthState | null;
  user: UserOut | null;
  isAdmin: boolean;
  refresh: () => Promise<AuthState | null>;
}

const AuthContext = createContext<AuthContextValue>({
  state: null,
  user: null,
  isAdmin: false,
  refresh: async () => null,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// Pages reachable while signed out
const OPEN_PATHS = ["/signin", "/r/"];

function isOpen(path: string): boolean {
  return OPEN_PATHS.some((p) => path === p || path.startsWith(p));
}

/**
 * Who is signed in, for every page (doc 27 A05). With accounts off the API answers with the
 * local user, who is also the admin, so nothing changes for a single-user install.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const s = await api.authState();
      setState(s);
      setFailed(false);
      return s;
    } catch {
      setFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 from any page means the session ended: check, and go to sign-in if so
  useEffect(() => {
    const onUnauthorized = () => void refresh();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);

  // The account's language and playback speed follow it to this browser
  const userId = state?.user?.id;
  useEffect(() => {
    if (userId) void pullSettings();
  }, [userId]);

  const mustSignIn = !!state?.authEnabled && !state.user && !isOpen(pathname);
  const mustConsent = !!state?.needsConsent && pathname !== "/welcome" && !isOpen(pathname);

  useEffect(() => {
    if (mustSignIn) router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
    else if (mustConsent) router.replace("/welcome");
  }, [mustSignIn, mustConsent, pathname, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state?.user ?? null, isAdmin: state?.user?.role === "admin", refresh }),
    [state, refresh],
  );

  // Until the API has answered, pages would only flash and then move to sign-in.
  // When the API is down, pages show their own "API not reachable" message.
  // Sign-in waits too, or its form flashes before "No sign-in needed"; shared reviews never wait for an account
  const hold = !failed && ((state === null && !pathname.startsWith("/r/")) || ((mustSignIn || mustConsent) && !isOpen(pathname)));
  // The empty header keeps the shell's 80px row, so the page does not jump up and back once it opens
  return <AuthContext.Provider value={value}>{hold ? <div className="shell"><header className="topbar" aria-hidden="true" />
    <main className="main" id="content"><LoadingState label="Opening Round Reviewer…" /></main></div> : children}</AuthContext.Provider>;
}
