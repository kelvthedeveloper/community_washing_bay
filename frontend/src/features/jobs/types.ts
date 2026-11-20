export type JobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface JobServiceSnapshot {
  service: string;
  service_name: string;
  price_snapshot: string | null;
  discount_amount: string;
  commissionable_amount: string | null;
  commission_rate_snapshot: string | null;
  commission_amount: string | null;
}

export interface JobWorkerAssignment {
  worker: string;
  worker_name: string;
  commission_amount: string | null;
}

export interface Job {
  id: string;
  vehicle: string | null;
  vehicle_number_plate: string | null;
  number_plate: string;
  vehicle_type: string;
  vehicle_type_name: string;
  services: JobServiceSnapshot[];
  assigned_workers: JobWorkerAssignment[];
  job_date: string;
  status: JobStatus;
  registered_at: string;
  washing_started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  total_price: string;
  subtotal: string;
  discount_type: "NONE" | "PERCENTAGE" | "FIXED";
  discount_value: string;
  discount_amount: string;
  discount_applied_by: string | null;
  discount_applied_by_name: string | null;
  commission_amount: string | null;
  amount_paid: string;
  amount_due: string;
  payment_status: "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";
  created_by: string | null;
  created_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobPayment {
  id: string;
  job: string;
  amount: string;
  method: PaymentMethod;
  payment_date: string;
  notes: string;
  recorded_by_name: string | null;
}

export interface JobRefund {
  id: string;
  job: string;
  payment: string;
  amount: string;
  method: PaymentMethod;
  refund_date: string;
  reason: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export type PaymentMethod =
  | "CASH"
  | "MOBILE_MONEY"
  | "CARD"
  | "BANK_TRANSFER";

export interface Vehicle {
  id: string;
  number_plate: string;
  vehicle_type: string;
  vehicle_type_name: string;
  created_at: string;
  updated_at: string;
}

export interface JobQuote {
  job_date: string;
  vehicle_type: string;
  subtotal: string;
  discount_type: "NONE" | "PERCENTAGE" | "FIXED";
  discount_value: string;
  discount_amount: string;
  services: Array<{
    id: string;
    name: string;
    price: string;
    discount_amount: string;
    total: string;
    commission_rate: string;
  }>;
  total_price: string;
}

export interface JobReceipt {
  receipt_number: string;
  issued_at: string;
  job: Job;
  payments: JobPayment[];
  refunds: JobRefund[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
