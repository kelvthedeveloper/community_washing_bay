export interface InventoryCategory {
  id: string;
  name: string;
  is_active: boolean;
}

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  category_name: string;
  unit_label: string;
  low_stock_threshold: string;
  description: string;
  is_active: boolean;
  stock_on_hand: string;
  average_unit_cost: string;
  stock_value: string;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string;
  phone_number: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryPurchaseLine {
  id: string;
  product: string;
  product_name: string;
  unit_label: string;
  quantity: string;
  unit_cost: string;
  total_cost: string;
}

export interface InventoryPurchase {
  id: string;
  supplier: string;
  supplier_name: string;
  purchase_date: string;
  invoice_number: string;
  total_cost: string;
  notes: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  lines: InventoryPurchaseLine[];
  created_at: string;
}

export interface StockMovement {
  id: string;
  product: string;
  product_name: string;
  unit_label: string;
  movement_type: "PURCHASE" | "USAGE" | "ADJUSTMENT";
  quantity: string;
  unit_cost_snapshot: string;
  value_change: string;
  purchase: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  occurred_at: string;
  reason: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface InventoryValuationReport {
  as_of: string;
  total_stock_value: string;
  low_stock_count: number;
  items: Array<{
    product: string;
    name: string;
    sku: string;
    category: string;
    unit_label: string;
    is_active: boolean;
    quantity_on_hand: string;
    average_unit_cost: string;
    stock_value: string;
    is_low_stock: boolean;
  }>;
}

export interface InventoryMovementReport {
  start_date: string;
  end_date: string;
  movement_count: number;
  total_purchase_cost: string;
  total_usage_cost: string;
  items: Array<{
    product: string;
    name: string;
    unit_label: string;
    purchased_quantity: string;
    purchase_cost: string;
    used_quantity: string;
    usage_cost: string;
    adjustment_quantity: string;
    movement_count: number;
  }>;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface InventoryProductWritePayload {
  name: string;
  sku: string;
  category: string;
  unit_label: string;
  low_stock_threshold: string;
  description: string;
  is_active: boolean;
}

export interface SupplierWritePayload {
  name: string;
  contact_name: string;
  phone_number: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
}

export interface InventoryPurchaseWritePayload {
  supplier: string;
  purchase_date: string;
  invoice_number: string;
  notes: string;
  lines: Array<{
    product: string;
    quantity: string;
    unit_cost: string;
  }>;
}

export interface StockTransactionPayload {
  quantity: string;
  reason: string;
  unit_cost?: string;
}
