import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

import type { AuthTokens } from "@/features/auth/types";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const refreshClient = axios.create({
  baseURL: apiBaseUrl,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<AuthTokens> | null = null;

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  authRetried?: boolean;
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15_000,
});

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function setAuthTokens(tokens: AuthTokens | null) {
  accessToken = tokens?.access ?? null;
  refreshToken = tokens?.refresh ?? null;
  window.dispatchEvent(new Event("auth:tokens-updated"));
}

export function clearAuthTokens() {
  setAuthTokens(null);
}

function expireSession() {
  clearAuthTokens();
  window.dispatchEvent(new Event("auth:session-expired"));
}

export async function refreshSession() {
  if (!refreshToken) {
    expireSession();
    throw new Error("No refresh token is available.");
  }

  if (!refreshPromise) {
    const activeRefreshToken = refreshToken;
    refreshPromise = refreshClient
      .post<AuthTokens>("/v1/auth/token/refresh/", {
        refresh: activeRefreshToken,
      })
      .then(({ data }) => {
        setAuthTokens(data);
        return data;
      })
      .catch((error: unknown) => {
        expireSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    config.headers.delete("Authorization");
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryableRequestConfig | undefined;
    const isLoginOrRefreshRequest =
      request?.url === "/v1/auth/token/" ||
      request?.url === "/v1/auth/token/refresh/";

    if (
      error.response?.status !== 401 ||
      !request ||
      isLoginOrRefreshRequest ||
      request.authRetried
    ) {
      return Promise.reject(error);
    }

    request.authRetried = true;
    try {
      await refreshSession();
      if (request.url?.endsWith("/auth/token/logout/") && refreshToken) {
        request.data = { refresh: refreshToken };
      }
      return apiClient(request);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);
