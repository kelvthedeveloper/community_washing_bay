import { apiClient } from "@/lib/api-client";

import type {
  InventoryCategory,
  InventoryMovementReport,
  InventoryProduct,
  InventoryProductWritePayload,
  InventoryPurchase,
  InventoryPurchaseWritePayload,
  InventoryValuationReport,
  PaginatedResponse,
  StockMovement,
  StockTransactionPayload,
  Supplier,
  SupplierWritePayload,
} from "./types";

export async function fetchInventoryProducts(
  params: Record<string, string | number>,
) {
  const response = await apiClient.get<PaginatedResponse<InventoryProduct>>(
    "/v1/inventory/products/",
    { params },
  );
  return response.data;
}

export async function fetchInventoryProductOptions() {
  return fetchInventoryProducts({
    page_size: 100,
    is_active: "true",
    ordering: "name",
  });
}

export async function createInventoryProduct(
  payload: InventoryProductWritePayload,
) {
  const response = await apiClient.post<InventoryProduct>(
    "/v1/inventory/products/",
    payload,
  );
  return response.data;
}

export async function updateInventoryProduct(
  productId: string,
  payload: InventoryProductWritePayload,
) {
  const response = await apiClient.patch<InventoryProduct>(
    `/v1/inventory/products/${productId}/`,
    payload,
  );
  return response.data;
}

export async function deactivateInventoryProduct(productId: string) {
  await apiClient.delete(`/v1/inventory/products/${productId}/`);
}

export async function fetchInventoryCategories() {
  const response = await apiClient.get<PaginatedResponse<InventoryCategory>>(
    "/v1/configuration/inventory-categories/",
    { params: { page_size: 100, ordering: "name" } },
  );
  return response.data;
}

export async function fetchSuppliers(params: Record<string, string | number>) {
  const response = await apiClient.get<PaginatedResponse<Supplier>>(
    "/v1/inventory/suppliers/",
    { params },
  );
  return response.data;
}

export async function fetchSupplierOptions() {
  return fetchSuppliers({ page_size: 100, is_active: "true", ordering: "name" });
}

export async function createSupplier(payload: SupplierWritePayload) {
  const response = await apiClient.post<Supplier>(
    "/v1/inventory/suppliers/",
    payload,
  );
  return response.data;
}

export async function updateSupplier(
  supplierId: string,
  payload: SupplierWritePayload,
) {
  const response = await apiClient.patch<Supplier>(
    `/v1/inventory/suppliers/${supplierId}/`,
    payload,
  );
  return response.data;
}

export async function deactivateSupplier(supplierId: string) {
  await apiClient.delete(`/v1/inventory/suppliers/${supplierId}/`);
}

export async function fetchPurchases(params: Record<string, string | number>) {
  const response = await apiClient.get<PaginatedResponse<InventoryPurchase>>(
    "/v1/inventory/purchases/",
    { params },
  );
  return response.data;
}

export async function createPurchase(payload: InventoryPurchaseWritePayload) {
  const response = await apiClient.post<InventoryPurchase>(
    "/v1/inventory/purchases/",
    payload,
  );
  return response.data;
}

export async function fetchMovements(
  params: Record<string, string | number>,
) {
  const response = await apiClient.get<PaginatedResponse<StockMovement>>(
    "/v1/inventory/movements/",
    { params },
  );
  return response.data;
}

export async function recordStockUsage(
  productId: string,
  payload: StockTransactionPayload,
) {
  const response = await apiClient.post<StockMovement>(
    `/v1/inventory/products/${productId}/usage/`,
    payload,
  );
  return response.data;
}

export async function recordStockAdjustment(
  productId: string,
  payload: StockTransactionPayload,
) {
  const response = await apiClient.post<StockMovement>(
    `/v1/inventory/products/${productId}/adjustment/`,
    payload,
  );
  return response.data;
}

export async function fetchValuationReport(asOf: string) {
  const response = await apiClient.get<InventoryValuationReport>(
    "/v1/inventory/reports/valuation/",
    { params: { as_of: asOf } },
  );
  return response.data;
}

export async function fetchMovementReport(
  startDate: string,
  endDate: string,
) {
  const response = await apiClient.get<InventoryMovementReport>(
    "/v1/inventory/reports/movements/",
    { params: { start_date: startDate, end_date: endDate } },
  );
  return response.data;
}
