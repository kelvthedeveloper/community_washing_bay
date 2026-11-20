export type ExpensePaymentMethod =
  | "CASH"
  | "MOBILE_MONEY"
  | "CARD"
  | "BANK_TRANSFER";

export interface ExpenseCategory {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Expense {
  id: string;
  category: string;
  category_name: string;
  amount: string;
  description: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  recorded_by: string | null;
  recorded_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancellation_reason: string;
  has_receipt: boolean;
  receipt_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseWritePayload {
  category: string;
  amount: string;
  description: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  receipt?: File;
}

export interface ExpenseAuditSnapshot {
  category: string;
  category_name: string;
  amount: string;
  description: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  receipt_name: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
}

export interface ExpenseHistoryEntry {
  id: string;
  event_type: "CREATED" | "UPDATED" | "CANCELLED";
  actor: string | null;
  actor_name: string | null;
  before: ExpenseAuditSnapshot | null;
  after: ExpenseAuditSnapshot;
  created_at: string;
}

export interface ExpenseReportGroup {
  category?: string;
  category_name?: string;
  payment_method?: ExpensePaymentMethod;
  count: number;
  total_amount: string;
}

export interface ExpenseDailyReport {
  date: string;
  expense_count: number;
  cancelled_count: number;
  total_amount: string;
  by_category: ExpenseReportGroup[];
  by_payment_method: ExpenseReportGroup[];
}

export interface ExpenseMonthlyReport {
  month: string;
  expense_count: number;
  cancelled_count: number;
  total_amount: string;
  by_category: ExpenseReportGroup[];
  by_payment_method: ExpenseReportGroup[];
  daily_totals: Array<{
    date: string;
    count: number;
    total_amount: string;
  }>;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
