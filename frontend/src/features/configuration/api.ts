import { apiClient } from "@/lib/api-client";

import type {
  ConfigurationRecord,
  PaginatedResponse,
} from "./types";

export async function fetchConfigurationPage<T extends ConfigurationRecord>(
  endpoint: string,
  params: Record<string, string | number>,
) {
  const response = await apiClient.get<PaginatedResponse<T>>(endpoint, {
    params,
  });
  return response.data;
}
