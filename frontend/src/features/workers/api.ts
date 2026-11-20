import { apiClient } from "@/lib/api-client";

import type {
  CommissionPayment,
  CommissionPaymentWritePayload,
  CommissionLedgerEntry,
  CommissionLedgerWritePayload,
  CommissionSummary,
  PaginatedResponse,
  Worker,
  WorkerJob,
  WorkerWritePayload,
} from "./types";

export async function fetchWorkers(params: Record<string, string | number>) {
  const response = await apiClient.get<PaginatedResponse<Worker>>(
    "/v1/workers/",
    { params },
  );
  return response.data;
}

export async function fetchWorker(workerId: string) {
  const response = await apiClient.get<Worker>(`/v1/workers/${workerId}/`);
  return response.data;
}

export async function createWorker(payload: WorkerWritePayload) {
  const response = await apiClient.post<Worker>("/v1/workers/", payload);
  return response.data;
}

export async function updateWorker(
  workerId: string,
  payload: WorkerWritePayload,
) {
  const response = await apiClient.patch<Worker>(
    `/v1/workers/${workerId}/`,
    payload,
  );
  return response.data;
}

export async function deactivateWorker(workerId: string) {
  await apiClient.delete(`/v1/workers/${workerId}/`);
}

export async function fetchWorkerJobHistory(
  workerId: string,
  page: number,
  pageSize: number,
) {
  const response = await apiClient.get<PaginatedResponse<WorkerJob>>(
    `/v1/workers/${workerId}/job-history/`,
    { params: { page, page_size: pageSize } },
  );
  return response.data;
}

export async function fetchWorkerCommissionSummary(
  workerId: string,
  date: string,
  period: CommissionSummary["period"],
) {
  const response = await apiClient.get<CommissionSummary>(
    `/v1/workers/${workerId}/commission-summary/`,
    { params: { date, period } },
  );
  return response.data;
}

export async function fetchWorkerCommissionLedger(
  workerId: string,
  page: number,
  pageSize: number,
) {
  const response = await apiClient.get<PaginatedResponse<CommissionLedgerEntry>>(
    `/v1/workers/${workerId}/commission-ledger/`,
    { params: { page, page_size: pageSize } },
  );
  return response.data;
}

export async function fetchWorkerCommissionPayments(
  workerId: string,
  page: number,
  pageSize: number,
) {
  const response = await apiClient.get<PaginatedResponse<CommissionPayment>>(
    `/v1/workers/${workerId}/commission-payments/`,
    { params: { page, page_size: pageSize } },
  );
  return response.data;
}

export async function createWorkerCommissionPayment(
  workerId: string,
  payload: CommissionPaymentWritePayload,
) {
  const response = await apiClient.post<CommissionPayment>(
    `/v1/workers/${workerId}/commission-payments/`,
    payload,
  );
  return response.data;
}

export async function createWorkerCommissionLedgerEntry(
  workerId: string,
  payload: CommissionLedgerWritePayload,
) {
  const response = await apiClient.post<CommissionLedgerEntry>(
    `/v1/workers/${workerId}/commission-ledger/`,
    payload,
  );
  return response.data;
}
