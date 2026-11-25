/**
 * Account session hydration, auth mutations, and auth-aware route guards.
 *
 * Keeps session lifecycle effects and navigation redirects out of page and
 * context components.
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  authGetMe,
  authLogin,
  authLogout,
  authRegister,
  getResumableGames,
} from "../../api/client";
import { useAuth, type AuthState } from "../../contexts/authState";
import { useResumableGames, type ResumableSeat } from "../useResumableGames";
import { forgetAccountSeats } from "../../utils/deviceIdentity";
import { prefetchLegendaryName } from "../../utils/prefetchName";
import { dropForgottenSessions } from "../../utils/tabSession";

export function useAuthSession(): AuthState {
  const [user, setUser] = useState<{
    user_id: string;
    username: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void authGetMe().then((u) => {
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await authLogin(username, password);
    setUser(u);
  }, []);

  const register = useCallback(
    async (username: string, password: string, email: string) => {
      const u = await authRegister(username, password, email);
      setUser(u);
    },
    [],
  );

  const logout = useCallback(async () => {
    // Sending no seat tokens lists only the account's seats, and it has to be asked while still logged in.
    const accountSeats = await getResumableGames([]);
    await authLogout();
    forgetAccountSeats(accountSeats);
    // Only other tabs hear that storage changed.
    dropForgottenSessions();
    setUser(null);
  }, []);

  return { user, loading, login, register, logout };
}

export function useRequireAuth(returnTo?: string): AuthState {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const targetReturnTo = returnTo ?? encodeURIComponent(location.pathname);

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      void navigate(`/login?returnTo=${targetReturnTo}`, { replace: true });
    }
  }, [auth.loading, auth.user, navigate, targetReturnTo]);

  return auth;
}

export function useRedirectWhen(
  condition: boolean,
  to: string,
  replace = true,
): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (condition) {
      void navigate(to, { replace });
    }
  }, [condition, to, replace, navigate]);
}

export function useHomeSession(): {
  user: AuthState["user"];
  loading: boolean;
  seats: ResumableSeat[];
  markSeatClosed: (gameId: string) => void;
} {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const resumableGames = useResumableGames();
  const [closedIds, setClosedIds] = useState<string[]>([]);

  useEffect(() => {
    prefetchLegendaryName();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      void navigate("/dashboard", { replace: true });
    }
  }, [loading, user, navigate]);

  const seats = resumableGames.filter(
    (seat) => !closedIds.includes(seat.gameId),
  );
  const markSeatClosed = useCallback((gameId: string) => {
    setClosedIds((ids) => [...ids, gameId]);
  }, []);

  return { user, loading, seats, markSeatClosed };
}
