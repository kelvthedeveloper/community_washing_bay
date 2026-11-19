import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  refreshSession,
  setAuthTokens,
} from "@/lib/api-client";

import { getCurrentUser, loginRequest, logoutRequest } from "./auth-api";
import type { AuthUser, LoginCredentials } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionNotice: string | null;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getTokenExpiry(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded)) as { exp?: unknown };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [tokenRevision, setTokenRevision] = useState(0);

  useEffect(() => {
    const handleTokensUpdated = () => {
      setTokenRevision((revision) => revision + 1);
    };
    const handleSessionExpired = () => {
      setUser(null);
      setIsLoading(false);
      setSessionNotice("Your session expired. Please sign in again.");
    };

    window.addEventListener("auth:tokens-updated", handleTokensUpdated);
    window.addEventListener("auth:session-expired", handleSessionExpired);
    return () => {
      window.removeEventListener("auth:tokens-updated", handleTokensUpdated);
      window.removeEventListener("auth:session-expired", handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    const accessToken = getAccessToken();
    const expiresAt = accessToken ? getTokenExpiry(accessToken) : null;
    if (!expiresAt) {
      return;
    }

    const refreshDelay = Math.max(expiresAt - Date.now() - 30_000, 0);
    const timeoutId = window.setTimeout(() => {
      void refreshSession().catch(() => undefined);
    }, refreshDelay);

    return () => window.clearTimeout(timeoutId);
  }, [user, tokenRevision]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setSessionNotice(null);
    try {
      const tokens = await loginRequest(credentials);
      setAuthTokens(tokens);
      const authenticatedUser = await getCurrentUser();
      setUser(authenticatedUser);
      return authenticatedUser;
    } catch (error) {
      clearAuthTokens();
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    try {
      if (refresh) {
        await logoutRequest(refresh);
      }
    } finally {
      clearAuthTokens();
      setUser(null);
    }
  }, []);

  const clearSessionNotice = useCallback(() => {
    setSessionNotice(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      sessionNotice,
      login,
      logout,
      clearSessionNotice,
    }),
    [user, isLoading, sessionNotice, login, logout, clearSessionNotice],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
