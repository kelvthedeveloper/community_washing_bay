import type { AxiosResponse } from "axios";

import { apiClient } from "@/lib/api-client";
import type { NamedConfigurationRecord } from "@/features/configuration/types";
import type { Worker } from "@/features/workers/types";

import type {
  Job,
  JobPayment,
  JobQuote,
  JobRefund,
  JobReceipt,
  PaginatedResponse,
  Vehicle,
} from "./types";

export async function fetchJobs(params: Record<string, string | number>) {
  const response = await apiClient.get<PaginatedResponse<Job>>("/v1/jobs/", {
    params,
  });
  return response.data;
}

export async function fetchJobOptions() {
  const [vehicleTypes, services, workers] = await Promise.all([
    apiClient.get<PaginatedResponse<NamedConfigurationRecord>>(
      "/v1/configuration/vehicle-types/",
      { params: { is_active: true, page_size: 100 } },
    ),
    apiClient.get<PaginatedResponse<NamedConfigurationRecord>>(
      "/v1/configuration/services/",
      { params: { is_active: true, page_size: 100 } },
    ),
    apiClient.get<PaginatedResponse<Worker>>("/v1/workers/", {
      params: { is_active: true, page_size: 100 },
    }),
  ]);
  return {
    vehicleTypes: vehicleTypes.data.results,
    services: services.data.results,
    workers: workers.data.results,
  };
}

export async function fetchJobQuote(
  vehicleTypeId: string,
  serviceIds: string[],
  discountType = "NONE",
  discountValue = "0.00",
) {
  const response = await apiClient.get<JobQuote>("/v1/jobs/quote/", {
    params: {
      vehicle_type: vehicleTypeId,
      services: serviceIds.join(","),
      discount_type: discountType,
      discount_value: discountValue,
    },
  });
  return response.data;
}

export async function searchVehicles(numberPlate: string) {
  const response = await apiClient.get<PaginatedResponse<Vehicle>>(
    "/v1/vehicles/",
    { params: { search: numberPlate, page_size: 100 } },
  );
  return response.data.results;
}

export async function createSale(
  payload: {
  number_plate: string;
  vehicle_type: string;
  workers: string[];
  services: string[];
  discount_type: "NONE" | "PERCENTAGE" | "FIXED";
  discount_value: string;
  initial_payment: {
    amount: string;
    method?: string;
    payment_date: string;
    notes: string;
  };
},
idempotencyKey: string,
) {
  const response = await apiClient.post<Job>("/v1/pos/sales/", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return response.data;
}

export async function transitionJob(
  jobId: string,
  action: "start" | "complete" | "cancel",
) {
  const response = await apiClient.post<Job>(`/v1/jobs/${jobId}/${action}/`, {});
  return response.data;
}

export async function fetchJobPayments(jobId: string) {
  return fetchAllPages<JobPayment>(`/v1/jobs/${jobId}/payments/`);
}

export async function fetchJobRefunds(jobId: string) {
  return fetchAllPages<JobRefund>(`/v1/jobs/${jobId}/refunds/`);
}

export async function fetchJobReceipt(jobId: string) {
  const response = await apiClient.get<JobReceipt>(
    `/v1/jobs/${jobId}/receipt/`,
  );
  return response.data;
}

export async function createJobPayment(
  jobId: string,
  payload: {
    amount: string;
    method: string;
    payment_date: string;
    notes: string;
  },
  idempotencyKey: string,
) {
  const response = await apiClient.post<JobPayment>(
    `/v1/jobs/${jobId}/payments/`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

export async function createJobRefund(
  jobId: string,
  payload: {
    payment: string;
    amount: string;
    refund_date: string;
    reason: string;
  },
  idempotencyKey: string,
) {
  const response = await apiClient.post<JobRefund>(
    `/v1/jobs/${jobId}/refunds/`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

async function fetchAllPages<T>(url: string): Promise<PaginatedResponse<T>> {
  const results: T[] = [];
  let nextUrl: string | null = url;
  let count = 0;
  let isFirstPage = true;
  while (nextUrl) {
    const response: AxiosResponse<PaginatedResponse<T>> =
      await apiClient.get<PaginatedResponse<T>>(nextUrl, {
        params: isFirstPage ? { page_size: 100 } : undefined,
      });
    results.push(...response.data.results);
    count = response.data.count;
    nextUrl = response.data.next;
    isFirstPage = false;
  }
  return { count, next: null, previous: null, results };
}
