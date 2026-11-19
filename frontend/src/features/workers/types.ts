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
  worker: string;
  worker_name: string;
  vehicle_type: string;
  vehicle_type_name: string;
  service: string;
  service_name: string;
  status: "ASSIGNED" | "COMPLETED" | "CANCELLED";
  assigned_at: string;
  completed_at: string | null;
  service_price: string | null;
  commission_percentage: string | null;
  commission_amount: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionSummary {
  date: string;
  daily_commission: string;
  outstanding_commission: string;
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
