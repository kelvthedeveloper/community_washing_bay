import { apiClient } from "@/lib/api-client";

import type {
  Expense,
  ExpenseCategory,
  ExpenseDailyReport,
  ExpenseHistoryEntry,
  ExpenseMonthlyReport,
  ExpenseWritePayload,
  PaginatedResponse,
} from "./types";

function toFormData(payload: ExpenseWritePayload) {
  const formData = new FormData();
  formData.append("category", payload.category);
  formData.append("amount", payload.amount);
  formData.append("description", payload.description);
  formData.append("expense_date", payload.expense_date);
  formData.append("payment_method", payload.payment_method);
  if (payload.receipt) {
    formData.append("receipt", payload.receipt);
  }
  return formData;
}

export async function fetchExpenses(params: Record<string, string | number>) {
  const response = await apiClient.get<PaginatedResponse<Expense>>(
    "/v1/expenses/",
    { params },
  );
  return response.data;
}

export async function fetchExpenseCategories() {
  const response = await apiClient.get<PaginatedResponse<ExpenseCategory>>(
    "/v1/configuration/expense-categories/",
    { params: { page_size: 100, ordering: "name" } },
  );
  return response.data;
}

export async function createExpense(payload: ExpenseWritePayload) {
  const response = await apiClient.post<Expense>(
    "/v1/expenses/",
    toFormData(payload),
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

export async function updateExpense(
  expenseId: string,
  payload: ExpenseWritePayload,
) {
  const response = await apiClient.patch<Expense>(
    `/v1/expenses/${expenseId}/`,
    toFormData(payload),
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

export async function cancelExpense(expenseId: string, reason: string) {
  const response = await apiClient.post<Expense>(
    `/v1/expenses/${expenseId}/cancel/`,
    { reason },
  );
  return response.data;
}

export async function fetchExpenseHistory(expenseId: string) {
  const response = await apiClient.get<ExpenseHistoryEntry[]>(
    `/v1/expenses/${expenseId}/history/`,
  );
  return response.data;
}

export async function downloadExpenseReceipt(expenseId: string) {
  const response = await apiClient.get<Blob>(
    `/v1/expenses/${expenseId}/receipt/`,
    { responseType: "blob" },
  );
  return response.data;
}

export async function fetchDailyExpenseReport(date: string) {
  const response = await apiClient.get<ExpenseDailyReport>(
    "/v1/expenses/reports/daily/",
    { params: { date } },
  );
  return response.data;
}

export async function fetchMonthlyExpenseReport(month: string) {
  const response = await apiClient.get<ExpenseMonthlyReport>(
    "/v1/expenses/reports/monthly/",
    { params: { month } },
  );
  return response.data;
}
