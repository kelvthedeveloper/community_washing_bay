export interface Worker {
  id: string;
  full_name: string;
  phone_number: string;
  address: string;
  employment_date: string;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface WorkerWritePayload {
  full_name: string;
  phone_number: string;
  address: string;
  employment_date: string;
  is_active: boolean;
  notes: string;
}

export interface WorkerJob {
  id: string;
  number_plate: string;
  vehicle_type: string;
  vehicle_type_name: string;
  services: Array<{
    service: string;
    service_name: string;
    price_snapshot: string | null;
    commission_rate_snapshot: string | null;
    commission_amount: string | null;
  }>;
  assigned_workers: Array<{
    worker: string;
    worker_name: string;
    commission_amount: string | null;
  }>;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  registered_at: string;
  washing_started_at: string | null;
  completed_at: string | null;
  total_price: string;
  commission_amount: string | null;
  job_date: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionSummary {
  period: "daily" | "weekly" | "monthly";
  period_start: string;
  period_end: string;
  total_wash_sales: string;
  commission_percentage: string | null;
  commission_percentages: string[];
  earned_commission: string;
  paid_commission: string;
  date?: string;
  daily_commission?: string;
  outstanding_commission: string;
}

export interface CommissionLedgerEntry {
  id: string;
  worker: string;
  job: string | null;
  assignment: string | null;
  source_entry: string | null;
  is_reversed: boolean;
  entry_type: "EARNED" | "ADJUSTMENT" | "REVERSAL";
  amount: string;
  effective_date: string;
  reason: string;
  commission_base_snapshot: string | null;
  commission_rate_snapshot: string | null;
  allocation_policy_snapshot: "EQUAL_SPLIT" | "PER_WORKER" | null;
  allocation_worker_count_snapshot: number | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface CommissionPayment {
  id: string;
  worker: string;
  amount: string;
  payment_date: string;
  notes: string;
  recorded_by_name: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CommissionPaymentWritePayload {
  amount: string;
  payment_date: string;
  notes: string;
}

export type CommissionLedgerWritePayload =
  | {
      entry_type: "ADJUSTMENT";
      amount: string;
      effective_date: string;
      reason: string;
    }
  | {
      entry_type: "REVERSAL";
      source_entry: string;
      effective_date: string;
      reason: string;
    };
