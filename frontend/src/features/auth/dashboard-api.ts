import { apiClient } from "@/lib/api-client";
import { fetchDailyExpenseReport, fetchExpenses } from "@/features/expenses/api";
import type { Expense } from "@/features/expenses/types";
import { fetchInventoryProducts, fetchMovements } from "@/features/inventory/api";
import type { StockMovement } from "@/features/inventory/types";
import { fetchJobs } from "@/features/jobs/api";
import type { Job, PaginatedResponse } from "@/features/jobs/types";
import type { OwnerReport } from "@/features/reporting/types";
import type { Worker } from "@/features/workers/types";

export interface ManagedAccount {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER";
  is_active: boolean;
  date_joined: string;
}

export interface DashboardActivity {
  id: string;
  kind: "job" | "expense" | "inventory" | "account";
  label: string;
  detail: string;
  actor: string | null;
  occurredAt: string;
  amount: string | null;
}

export async function fetchOwnerDashboardReport(
  startDate: string,
  endDate: string,
) {
  const response = await apiClient.get<OwnerReport>("/v1/reports/summary/", {
    params: {
      start_date: startDate,
      end_date: endDate,
      group_by: "daily",
    },
  });
  return response.data;
}

export async function fetchManagerDayJobs(date: string) {
  const results: Job[] = [];
  let page = 1;
  let next: string | null = "start";
  while (next) {
    const response = await fetchJobs({
      page,
      page_size: 100,
      job_date: date,
      ordering: "-registered_at",
    });
    results.push(...response.results);
    next = response.next;
    page += 1;
  }
  return results;
}

export async function fetchActiveJobs() {
  const response = await fetchJobs({
    page: 1,
    page_size: 100,
    status: "IN_PROGRESS",
    ordering: "-registered_at",
  });
  return response;
}

export async function fetchRecentJobs(pageSize = 6) {
  return fetchJobs({
    page: 1,
    page_size: pageSize,
    ordering: "-registered_at",
  });
}

export async function fetchRecentExpenses(pageSize = 6, date?: string) {
  const params: Record<string, string | number> = {
    page: 1,
    page_size: pageSize,
    ordering: "-created_at",
  };
  if (date) {
    params.expense_date = date;
  }
  return fetchExpenses(params);
}

export async function fetchLowStockProducts() {
  const response = await fetchInventoryProducts({
    page: 1,
    page_size: 100,
    low_stock: "true",
  });
  return response;
}

export async function fetchDailyExpenses(date: string) {
  return fetchDailyExpenseReport(date);
}

export async function fetchManagedAccounts(params: Record<string, string | number> = {}) {
  const response = await apiClient.get<ManagedAccount[] | PaginatedResponse<ManagedAccount>>(
    "/v1/users/",
    { params },
  );
  if (Array.isArray(response.data)) {
    return {
      count: response.data.length,
      next: null,
      previous: null,
      results: response.data,
    };
  }
  return response.data;
}

export async function createManagedAccount(payload: {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: ManagedAccount["role"];
  password: string;
  password_confirmation: string;
}) {
  const response = await apiClient.post<ManagedAccount>("/v1/users/", payload);
  return response.data;
}

export async function updateManagedAccount(
  userId: string,
  payload: Partial<Pick<ManagedAccount, "email" | "first_name" | "last_name" | "role" | "is_active">>,
) {
  const response = await apiClient.patch<ManagedAccount>(
    `/v1/users/${userId}/`,
    payload,
  );
  return response.data;
}

export async function fetchRecentActivity(): Promise<DashboardActivity[]> {
  const [jobs, expenses, movements] = await Promise.all([
    fetchRecentJobs(8),
    fetchRecentExpenses(8),
    fetchMovements({ page: 1, page_size: 8, ordering: "-occurred_at" }),
  ]);
  return [
    ...jobs.results.map(jobActivity),
    ...expenses.results.map(expenseActivity),
    ...movements.results.map(inventoryActivity),
  ]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 10);
}

export async function fetchDailyWorkerAssignments(date: string) {
  const [jobs, workers] = await Promise.all([
    fetchManagerDayJobs(date),
    apiClient.get<PaginatedResponse<Worker>>("/v1/workers/", {
      params: { page: 1, page_size: 100, is_active: "true" },
    }),
  ]);
  return {
    jobs,
    workers: workers.data.results,
    workerCount: workers.data.count,
  };
}

function jobActivity(job: Job): DashboardActivity {
  const completed = job.status === "COMPLETED";
  return {
    id: `job-${job.id}`,
    kind: "job",
    label: completed
      ? "Washing job completed"
      : job.status === "CANCELLED"
        ? "Washing job cancelled"
        : "Washing job registered",
    detail: job.number_plate || job.vehicle_type_name,
    actor: job.created_by_name,
    occurredAt: completed ? job.completed_at ?? job.registered_at : job.registered_at,
    amount: completed ? job.total_price : null,
  };
}

function expenseActivity(expense: Expense): DashboardActivity {
  return {
    id: `expense-${expense.id}`,
    kind: "expense",
    label: expense.cancelled_at ? "Expense cancelled" : "Expense recorded",
    detail: expense.description || expense.category_name,
    actor: expense.cancelled_by_name ?? expense.recorded_by_name,
    occurredAt: expense.updated_at,
    amount: expense.amount,
  };
}

function inventoryActivity(movement: StockMovement): DashboardActivity {
  return {
    id: `inventory-${movement.id}`,
    kind: "inventory",
    label: `Stock ${movement.movement_type.toLowerCase()}`,
    detail: movement.product_name,
    actor: movement.recorded_by_name,
    occurredAt: movement.occurred_at,
    amount: movement.value_change,
  };
}

