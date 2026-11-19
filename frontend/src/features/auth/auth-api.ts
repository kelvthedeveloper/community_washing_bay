import { apiClient } from "@/lib/api-client";

import type { AuthTokens, AuthUser, LoginCredentials } from "./types";

export async function loginRequest(credentials: LoginCredentials) {
  const response = await apiClient.post<AuthTokens>(
    "/v1/auth/token/",
    credentials,
  );
  return response.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get<AuthUser>("/v1/auth/me/");
  return response.data;
}

export async function logoutRequest(refresh: string) {
  await apiClient.post("/v1/auth/token/logout/", { refresh });
}
