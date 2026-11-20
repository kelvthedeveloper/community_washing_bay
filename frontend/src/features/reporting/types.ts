export type ReportGroupBy = "daily" | "weekly" | "monthly";

export interface OwnerReport {
  start_date: string;
  end_date: string;
  group_by: ReportGroupBy;
  opening_summary: {
    net_revenue: string;
    cash_collected: string;
    expenses: string;
    net_commission_cost: string;
    commission_payouts: string;
    inventory_purchases: string;
    inventory_usage_cost: string;
    outstanding_payments: string;
    gross_profit_estimate: string;
    net_operating_result: string;
  };
  total_vehicles_serviced: number;
  unique_vehicles_serviced: number;
  completed_jobs: number;
  cancelled_jobs: number;
  revenue_breakdown: {
    sales_before_discounts: string;
    discounts: string;
    completed_sales: string;
    sales_returns: string;
    net_revenue: string;
    payments_received: string;
    refunds_paid: string;
    net_cash_collected: string;
    canceled_job_refunds: string;
  };
  sales_by_period: Array<{
    period_start: string;
    sales: string;
    refunds: string;
    net_revenue: string;
    jobs: number;
    vehicles: number;
  }>;
  sales_by_service: Array<{
    service: string;
    service_name: string;
    quantity: number;
    sales_before_discounts: string;
    discounts: string;
    revenue: string;
  }>;
  expenses: {
    total: string;
    count: number;
    cancelled_amount: string;
    cancelled_count: number;
    by_category: Array<{
      category: string;
      category_name: string;
      count: number;
      amount: string;
    }>;
  };
  commissions: {
    earned: string;
    adjustments: string;
    reversals: string;
    net_cost: string;
    payout_count: number;
    payouts: string;
    by_worker: Array<{
      worker: string;
      worker_name: string;
      earned: string;
      adjustments: string;
      reversals: string;
      net_commission: string;
      payouts: string;
    }>;
    payouts_by_worker: Array<{
      worker: string;
      worker_name: string;
      count: number;
      amount: string;
    }>;
  };
  inventory: {
    purchase_count: number;
    purchases: string;
    usage_quantity: string;
    usage_cost: string;
    adjustment_count: number;
    adjustment_value: string;
    purchases_by_product: Array<{
      product: string;
      product_name: string;
      unit_label: string;
      quantity: string;
      amount: string;
    }>;
    usage_by_product: Array<{
      product: string;
      product_name: string;
      unit_label: string;
      quantity: string;
      amount: string;
    }>;
  };
  outstanding_payments: {
    amount: string;
    job_count: number;
    cash_held_for_cancelled_jobs: string;
  };
  gross_profit_estimate: string;
  net_operating_result: string;
}
