import { apiClient } from "@/lib/api-client";

import type { OwnerReport, ReportGroupBy } from "./types";

export async function fetchOwnerReport(params: {
  start_date: string;
  end_date: string;
  group_by: ReportGroupBy;
}) {
  const response = await apiClient.get<OwnerReport>("/v1/reports/summary/", {
    params,
  });
  return response.data;
}

export async function downloadOwnerReport(
  format: "csv" | "pdf",
  params: {
    start_date: string;
    end_date: string;
    group_by: ReportGroupBy;
  },
) {
  const response = await apiClient.get<Blob>(
    `/v1/reports/exports/${format}/`,
    { params, responseType: "blob" },
  );
  const extension = format;
  const downloadUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `community-washing-bay-report-${params.start_date}-${params.end_date}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}
