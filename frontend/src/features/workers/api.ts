import { apiClient } from "@/lib/api-client";

import type {
  CommissionPayment,
  CommissionPaymentWritePayload,
  CommissionSummary,
  PaginatedResponse,
  Worker,
  WorkerJob,
  WorkerWritePayload,
} from "./types";
import type { NamedConfigurationRecord } from "@/features/configuration/types";

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

export async function fetchActiveJobOptions() {
  const [vehicleTypes, services] = await Promise.all([
    apiClient.get<PaginatedResponse<NamedConfigurationRecord>>(
      "/v1/configuration/vehicle-types/",
      { params: { is_active: true, page_size: 100 } },
    ),
    apiClient.get<PaginatedResponse<NamedConfigurationRecord>>(
      "/v1/configuration/services/",
      { params: { is_active: true, page_size: 100 } },
    ),
  ]);
  return {
    vehicleTypes: vehicleTypes.data.results,
    services: services.data.results,
  };
}

export async function createWorkerJob(
  workerId: string,
  vehicleTypeId: string,
  serviceId: string,
) {
  const response = await apiClient.post<WorkerJob>("/v1/jobs/", {
    worker: workerId,
    vehicle_type: vehicleTypeId,
    service: serviceId,
  });
  return response.data;
}

export async function completeWorkerJob(jobId: string) {
  const response = await apiClient.post<WorkerJob>(
    `/v1/jobs/${jobId}/complete/`,
    {},
  );
  return response.data;
}

export async function cancelWorkerJob(jobId: string) {
  const response = await apiClient.post<WorkerJob>(
    `/v1/jobs/${jobId}/cancel/`,
    {},
  );
  return response.data;
}

export async function fetchWorkerCommissionSummary(
  workerId: string,
  date: string,
) {
  const response = await apiClient.get<CommissionSummary>(
    `/v1/workers/${workerId}/commission-summary/`,
    { params: { date } },
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
