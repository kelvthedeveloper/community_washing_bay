import { useState } from "react";
import { isAxiosError } from "axios";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Search,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { getRoleHomePath } from "@/features/auth/protected-route";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  localDateInputValue,
} from "@/features/workers/utils";

import {
  createInventoryProduct,
  createPurchase,
  createSupplier,
  deactivateInventoryProduct,
  deactivateSupplier,
  fetchInventoryCategories,
  fetchInventoryProductOptions,
  fetchInventoryProducts,
  fetchMovementReport,
  fetchMovements,
  fetchPurchases,
  fetchSupplierOptions,
  fetchSuppliers,
  fetchValuationReport,
  recordStockAdjustment,
  recordStockUsage,
  updateInventoryProduct,
  updateSupplier,
} from "./api";
import {
  InventoryProductDialog,
  PurchaseDialog,
  StockTransactionDialog,
  SupplierDialog,
} from "./inventory-dialogs";
import type {
  InventoryProduct,
  InventoryProductWritePayload,
  InventoryPurchaseWritePayload,
  PaginatedResponse,
  StockMovement,
  StockTransactionPayload,
  Supplier,
  SupplierWritePayload,
} from "./types";

type InventoryTab = "stock" | "suppliers" | "purchases" | "movements" | "reports";
type StockAction = { type: "usage" | "adjustment"; product: InventoryProduct } | null;
const pageSize = 10;

const inventoryTabs: Array<{ id: InventoryTab; label: string }> = [
  { id: "stock", label: "Stock items" },
  { id: "suppliers", label: "Suppliers" },
  { id: "purchases", label: "Purchases" },
  { id: "movements", label: "Movement history" },
  { id: "reports", label: "Reports" },
];

export function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<InventoryTab>("stock");
  const [productPage, setProductPage] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [productEditor, setProductEditor] = useState<
    InventoryProduct | null | undefined
  >(undefined);
  const [supplierEditor, setSupplierEditor] = useState<Supplier | null | undefined>(
    undefined,
  );
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseProduct, setPurchaseProduct] = useState<string | undefined>();
  const [stockAction, setStockAction] = useState<StockAction>(null);
  const [deactivatingProduct, setDeactivatingProduct] =
    useState<InventoryProduct | null>(null);
  const [deactivatingSupplier, setDeactivatingSupplier] =
    useState<Supplier | null>(null);
  const [reportDate, setReportDate] = useState(localDateInputValue());
  const [reportStartDate, setReportStartDate] = useState(
    localDateInputValue().slice(0, 8) + "01",
  );
  const [reportEndDate, setReportEndDate] = useState(localDateInputValue());
  const [notice, setNotice] = useState<string | null>(null);

  const productQuery = useQuery({
    queryKey: ["inventory-products", productPage, search, lowStockOnly],
    queryFn: () =>
      fetchInventoryProducts({
        page: productPage,
        page_size: pageSize,
        search,
        ...(lowStockOnly ? { low_stock: "true" } : {}),
      }),
    enabled: activeTab === "stock",
  });
  const productOptionsQuery = useQuery({
    queryKey: ["inventory-product-options"],
    queryFn: fetchInventoryProductOptions,
    enabled: purchaseDialogOpen,
  });
  const categoriesQuery = useQuery({
    queryKey: ["inventory-categories"],
    queryFn: fetchInventoryCategories,
    enabled: productEditor !== undefined,
  });
  const supplierQuery = useQuery({
    queryKey: ["inventory-suppliers", supplierPage],
    queryFn: () =>
      fetchSuppliers({ page: supplierPage, page_size: pageSize, ordering: "name" }),
    enabled: activeTab === "suppliers",
  });
  const supplierOptionsQuery = useQuery({
    queryKey: ["inventory-supplier-options"],
    queryFn: fetchSupplierOptions,
    enabled: purchaseDialogOpen,
  });
  const purchaseQuery = useQuery({
    queryKey: ["inventory-purchases", purchasePage],
    queryFn: () =>
      fetchPurchases({
        page: purchasePage,
        page_size: pageSize,
        ordering: "-purchase_date",
      }),
    enabled: activeTab === "purchases",
  });
  const movementQuery = useQuery({
    queryKey: ["inventory-movements", movementPage],
    queryFn: () =>
      fetchMovements({
        page: movementPage,
        page_size: pageSize,
        ordering: "-occurred_at",
      }),
    enabled: activeTab === "movements",
  });
  const lowStockQuery = useQuery({
    queryKey: ["inventory-low-stock-count"],
    queryFn: () =>
      fetchInventoryProducts({
        page: 1,
        page_size: 1,
        low_stock: "true",
      }),
  });
  const valuationQuery = useQuery({
    queryKey: ["inventory-valuation-report", reportDate],
    queryFn: () => fetchValuationReport(reportDate),
    enabled: activeTab === "reports",
  });
  const movementReportQuery = useQuery({
    queryKey: ["inventory-movement-report", reportStartDate, reportEndDate],
    queryFn: () => fetchMovementReport(reportStartDate, reportEndDate),
    enabled: activeTab === "reports",
  });

  const productMutation = useMutation({
    mutationFn: (values: {
      productId?: string;
      payload: InventoryProductWritePayload;
    }) =>
      values.productId
        ? updateInventoryProduct(values.productId, values.payload)
        : createInventoryProduct(values.payload),
    onSuccess: async (_product, values) => {
      await invalidateInventoryQueries(queryClient);
      setProductEditor(undefined);
      setNotice(values.productId ? "Inventory item updated." : "Inventory item registered.");
    },
  });
  const deactivateProductMutation = useMutation({
    mutationFn: (productId: string) => deactivateInventoryProduct(productId),
    onSuccess: async () => {
      await invalidateInventoryQueries(queryClient);
      setDeactivatingProduct(null);
      setNotice("Inventory item deactivated.");
    },
  });
  const supplierMutation = useMutation({
    mutationFn: (values: {
      supplierId?: string;
      payload: SupplierWritePayload;
    }) =>
      values.supplierId
        ? updateSupplier(values.supplierId, values.payload)
        : createSupplier(values.payload),
    onSuccess: async (_supplier, values) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-supplier-options"] }),
      ]);
      setSupplierEditor(undefined);
      setNotice(values.supplierId ? "Supplier updated." : "Supplier registered.");
    },
  });
  const deactivateSupplierMutation = useMutation({
    mutationFn: (supplierId: string) => deactivateSupplier(supplierId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-supplier-options"] }),
      ]);
      setDeactivatingSupplier(null);
      setNotice("Supplier deactivated.");
    },
  });
  const purchaseMutation = useMutation({
    mutationFn: (payload: InventoryPurchaseWritePayload) => createPurchase(payload),
    onSuccess: async () => {
      await invalidateInventoryQueries(queryClient);
      setPurchaseDialogOpen(false);
      setPurchaseProduct(undefined);
      setNotice("Stock purchase recorded.");
    },
  });
  const stockMutation = useMutation({
    mutationFn: (values: {
      productId: string;
      type: "usage" | "adjustment";
      payload: StockTransactionPayload;
    }) =>
      values.type === "usage"
        ? recordStockUsage(values.productId, values.payload)
        : recordStockAdjustment(values.productId, values.payload),
    onSuccess: async (_movement, values) => {
      await invalidateInventoryQueries(queryClient);
      setStockAction(null);
      setNotice(
        values.type === "usage" ? "Stock usage recorded." : "Stock adjustment recorded.",
      );
    },
  });

  if (!user) {
    return null;
  }

  const canManage = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const canRecord = canManage || user.role === "MANAGER";
  const lowStockCount = lowStockQuery.data?.count ?? 0;

  function openPurchase(productId?: string) {
    purchaseMutation.reset();
    setPurchaseProduct(productId);
    setPurchaseDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-9">
          <div className="flex items-center gap-5">
            <BrandMark compact />
            <div className="hidden border-l border-[#e6ece6] pl-5 sm:block">
              <p className="text-sm font-semibold text-foreground">
                Inventory management
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Supplies, stock movement, and valuation
              </p>
            </div>
          </div>
          <Button asChild className="rounded-xl" size="sm" variant="outline">
            <Link to={getRoleHomePath(user.role)}>Workspace</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
          to={getRoleHomePath(user.role)}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Workspace
        </Link>

        {notice && (
          <div
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            <Check aria-hidden="true" className="size-4" />
            {notice}
            <button
              aria-label="Dismiss notification"
              className="ml-auto underline-offset-4 hover:underline"
              onClick={() => setNotice(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        )}

        {lowStockCount > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-amber-700"
              />
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  {lowStockCount} item{lowStockCount === 1 ? "" : "s"} at or
                  below the low-stock threshold
                </p>
                <p className="mt-1 text-xs text-amber-900">
                  Review stock levels and record a replenishment purchase.
                </p>
              </div>
            </div>
            <Button
              className="rounded-xl"
              onClick={() => {
                setActiveTab("stock");
                setLowStockOnly(true);
                setProductPage(1);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              View low stock
            </Button>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-[#e4ebe4] bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-[#edf1ed] px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-[#17261d]">
                  Inventory
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Stock balances are derived from the permanent movement history.
                </p>
              </div>
              {activeTab === "stock" && canManage && (
                <Button
                  className="rounded-xl"
                  onClick={() => {
                    productMutation.reset();
                    setProductEditor(null);
                  }}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Register supply
                </Button>
              )}
              {activeTab === "suppliers" && canManage && (
                <Button
                  className="rounded-xl"
                  onClick={() => {
                    supplierMutation.reset();
                    setSupplierEditor(null);
                  }}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add supplier
                </Button>
              )}
              {activeTab === "purchases" && canRecord && (
                <Button
                  className="rounded-xl"
                  onClick={() => openPurchase()}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Record purchase
                </Button>
              )}
            </div>
            <div
              aria-label="Inventory views"
              className="flex gap-1 overflow-x-auto rounded-xl bg-[#f3f6f3] p-1"
              role="tablist"
            >
              {inventoryTabs.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "stock" && (
            <StockTab
              canManage={canManage}
              canRecord={canRecord}
              data={productQuery.data}
              error={productQuery.isError ? getInventoryErrorMessage(productQuery.error) : null}
              isLoading={productQuery.isPending}
              lowStockOnly={lowStockOnly}
              onChangeLowStock={setLowStockOnly}
              onDeactivate={setDeactivatingProduct}
              onEdit={(product) => {
                productMutation.reset();
                setProductEditor(product);
              }}
              onNext={() => setProductPage((current) => current + 1)}
              onOpenPurchase={openPurchase}
              onPrevious={() => setProductPage((current) => Math.max(current - 1, 1))}
              onSearch={(value) => {
                setSearch(value);
                setProductPage(1);
              }}
              onStockAction={(type, product) => {
                stockMutation.reset();
                setStockAction({ type, product });
              }}
              search={search}
            />
          )}
          {activeTab === "suppliers" && (
            <SupplierTab
              canManage={canManage}
              data={supplierQuery.data}
              error={supplierQuery.isError ? getInventoryErrorMessage(supplierQuery.error) : null}
              isLoading={supplierQuery.isPending}
              onDeactivate={setDeactivatingSupplier}
              onEdit={(supplier) => {
                supplierMutation.reset();
                setSupplierEditor(supplier);
              }}
              onNext={() => setSupplierPage((current) => current + 1)}
              onPrevious={() =>
                setSupplierPage((current) => Math.max(current - 1, 1))
              }
            />
          )}
          {activeTab === "purchases" && (
            <PurchaseTab
              data={purchaseQuery.data}
              error={purchaseQuery.isError ? getInventoryErrorMessage(purchaseQuery.error) : null}
              isLoading={purchaseQuery.isPending}
              onNext={() => setPurchasePage((current) => current + 1)}
              onPrevious={() =>
                setPurchasePage((current) => Math.max(current - 1, 1))
              }
            />
          )}
          {activeTab === "movements" && (
            <MovementTab
              data={movementQuery.data}
              error={movementQuery.isError ? getInventoryErrorMessage(movementQuery.error) : null}
              isLoading={movementQuery.isPending}
              onNext={() => setMovementPage((current) => current + 1)}
              onPrevious={() =>
                setMovementPage((current) => Math.max(current - 1, 1))
              }
            />
          )}
          {activeTab === "reports" && (
            <ReportsTab
              endDate={reportEndDate}
              movementData={movementReportQuery.data}
              movementError={
                movementReportQuery.isError
                  ? getInventoryErrorMessage(movementReportQuery.error)
                  : null
              }
              movementLoading={movementReportQuery.isPending}
              onEndDateChange={setReportEndDate}
              onReportDateChange={setReportDate}
              onStartDateChange={setReportStartDate}
              reportDate={reportDate}
              startDate={reportStartDate}
              valuationData={valuationQuery.data}
              valuationError={
                valuationQuery.isError
                  ? getInventoryErrorMessage(valuationQuery.error)
                  : null
              }
              valuationLoading={valuationQuery.isPending}
            />
          )}
        </section>
      </main>

      {productEditor !== undefined && (
        <InventoryProductDialog
          categories={categoriesQuery.data?.results ?? []}
          error={
            categoriesQuery.isError
              ? getInventoryErrorMessage(categoriesQuery.error)
              : productMutation.isError
                ? getInventoryErrorMessage(productMutation.error)
                : null
          }
          isSaving={productMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setProductEditor(undefined);
              productMutation.reset();
            }
          }}
          onSubmit={(payload) =>
            productMutation.mutate({
              productId:
                productEditor && typeof productEditor === "object"
                  ? productEditor.id
                  : undefined,
              payload,
            })
          }
          open
          product={productEditor}
        />
      )}
      {supplierEditor !== undefined && (
        <SupplierDialog
          error={
            supplierMutation.isError
              ? getInventoryErrorMessage(supplierMutation.error)
              : null
          }
          isSaving={supplierMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setSupplierEditor(undefined);
              supplierMutation.reset();
            }
          }}
          onSubmit={(payload) =>
            supplierMutation.mutate({
              supplierId:
                supplierEditor && typeof supplierEditor === "object"
                  ? supplierEditor.id
                  : undefined,
              payload,
            })
          }
          open
          supplier={supplierEditor}
        />
      )}
      {purchaseDialogOpen && (
        <PurchaseDialog
          error={
            productOptionsQuery.isError || supplierOptionsQuery.isError
              ? getInventoryErrorMessage(
                  productOptionsQuery.error ?? supplierOptionsQuery.error,
                )
              : purchaseMutation.isError
                ? getInventoryErrorMessage(purchaseMutation.error)
                : null
          }
          isSaving={purchaseMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setPurchaseDialogOpen(false);
              setPurchaseProduct(undefined);
              purchaseMutation.reset();
            }
          }}
          onSubmit={(payload) => purchaseMutation.mutate(payload)}
          open
          initialProductId={purchaseProduct}
          products={productOptionsQuery.data?.results ?? []}
          suppliers={supplierOptionsQuery.data?.results ?? []}
        />
      )}
      {stockAction && (
        <StockTransactionDialog
          error={
            stockMutation.isError
              ? getInventoryErrorMessage(stockMutation.error)
              : null
          }
          isSaving={stockMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setStockAction(null);
              stockMutation.reset();
            }
          }}
          onSubmit={(payload) =>
            stockMutation.mutate({
              productId: stockAction.product.id,
              type: stockAction.type,
              payload,
            })
          }
          open
          product={stockAction.product}
          type={stockAction.type}
        />
      )}
      {deactivatingProduct && (
        <ConfirmDialog
          description="The item remains in purchase and movement history and cannot receive new stock transactions."
          error={
            deactivateProductMutation.isError
              ? getInventoryErrorMessage(deactivateProductMutation.error)
              : null
          }
          isSaving={deactivateProductMutation.isPending}
          onCancel={() => {
            setDeactivatingProduct(null);
            deactivateProductMutation.reset();
          }}
          onConfirm={() =>
            deactivateProductMutation.mutate(deactivatingProduct.id)
          }
          title={`Deactivate ${deactivatingProduct.name}?`}
        />
      )}
      {deactivatingSupplier && (
        <ConfirmDialog
          description="The supplier remains linked to historical purchases but cannot be selected for new purchases."
          error={
            deactivateSupplierMutation.isError
              ? getInventoryErrorMessage(deactivateSupplierMutation.error)
              : null
          }
          isSaving={deactivateSupplierMutation.isPending}
          onCancel={() => {
            setDeactivatingSupplier(null);
            deactivateSupplierMutation.reset();
          }}
          onConfirm={() =>
            deactivateSupplierMutation.mutate(deactivatingSupplier.id)
          }
          title={`Deactivate ${deactivatingSupplier.name}?`}
        />
      )}
    </div>
  );
}

function StockTab({
  canManage,
  canRecord,
  data,
  error,
  isLoading,
  lowStockOnly,
  onChangeLowStock,
  onDeactivate,
  onEdit,
  onNext,
  onOpenPurchase,
  onPrevious,
  onSearch,
  onStockAction,
  search,
}: {
  canManage: boolean;
  canRecord: boolean;
  data: PaginatedResponse<InventoryProduct> | undefined;
  error: string | null;
  isLoading: boolean;
  lowStockOnly: boolean;
  onChangeLowStock: (value: boolean) => void;
  onDeactivate: (product: InventoryProduct) => void;
  onEdit: (product: InventoryProduct) => void;
  onNext: () => void;
  onOpenPurchase: (productId?: string) => void;
  onPrevious: () => void;
  onSearch: (value: string) => void;
  onStockAction: (type: "usage" | "adjustment", product: InventoryProduct) => void;
  search: string;
}) {
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-[#edf1ed] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <label className="relative block w-full sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search inventory items"
            className="h-10 rounded-xl pl-9"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search supplies"
            value={search}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            checked={lowStockOnly}
            className="size-4 accent-primary"
            onChange={(event) => onChangeLowStock(event.target.checked)}
            type="checkbox"
          />
          Show low stock only
        </label>
      </div>
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          message={
            lowStockOnly
              ? "No items are currently at or below their low-stock threshold."
              : "Register configurable supplies to start tracking stock."
          }
        />
      ) : (
        <>
          <div className="divide-y divide-[#edf1ed]">
            {data.results.map((product) => (
              <article
                className="flex flex-col gap-4 px-4 py-4 sm:px-6"
                key={product.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">
                        {product.name}
                      </h2>
                      <StatusBadge active={product.is_active} />
                      {product.is_low_stock && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                          Low stock
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {product.category_name}
                      {product.sku ? ` · SKU ${product.sku}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canRecord && product.is_active && (
                      <>
                        <Button
                          className="rounded-xl"
                          onClick={() => onOpenPurchase(product.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Purchase
                        </Button>
                        <Button
                          className="rounded-xl"
                          onClick={() => onStockAction("usage", product)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Record usage
                        </Button>
                      </>
                    )}
                    {canManage && product.is_active && (
                      <Button
                        className="rounded-xl"
                        onClick={() => onStockAction("adjustment", product)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Adjust
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <Button
                          className="rounded-xl"
                          onClick={() => onEdit(product)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        {product.is_active && (
                          <Button
                            className="rounded-xl text-destructive"
                            onClick={() => onDeactivate(product)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Deactivate
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 border-t border-[#edf1ed] pt-3 sm:grid-cols-4">
                  <Metric label="On hand" value={`${product.stock_on_hand} ${product.unit_label}`} />
                  <Metric label="Low-stock level" value={`${product.low_stock_threshold} ${product.unit_label}`} />
                  <Metric label="Average unit cost" value={formatMoney(product.average_unit_cost)} />
                  <Metric label="Stock value" value={formatMoney(product.stock_value)} />
                </dl>
              </article>
            ))}
          </div>
          <Pagination
            count={data.count}
            next={data.next}
            onNext={onNext}
            onPrevious={onPrevious}
            previous={data.previous}
          />
        </>
      )}
    </div>
  );
}

function SupplierTab({
  canManage,
  data,
  error,
  isLoading,
  onDeactivate,
  onEdit,
  onNext,
  onPrevious,
}: {
  canManage: boolean;
  data: PaginatedResponse<Supplier> | undefined;
  error: string | null;
  isLoading: boolean;
  onDeactivate: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  if (isLoading) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState message={error} />;
  }
  if (!data || data.results.length === 0) {
    return <EmptyState message="Register suppliers to associate them with purchases." />;
  }
  return (
    <>
      <div className="divide-y divide-[#edf1ed]">
        {data.results.map((supplier) => (
          <article
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            key={supplier.id}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-foreground">{supplier.name}</h2>
                <StatusBadge active={supplier.is_active} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[supplier.contact_name, supplier.phone_number, supplier.email]
                  .filter(Boolean)
                  .join(" · ") || "No contact details"}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button
                  onClick={() => onEdit(supplier)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Edit
                </Button>
                {supplier.is_active && (
                  <Button
                    className="text-destructive"
                    onClick={() => onDeactivate(supplier)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Deactivate
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <Pagination
        count={data.count}
        next={data.next}
        onNext={onNext}
        onPrevious={onPrevious}
        previous={data.previous}
      />
    </>
  );
}

function PurchaseTab({
  data,
  error,
  isLoading,
  onNext,
  onPrevious,
}: {
  data: PaginatedResponse<import("./types").InventoryPurchase> | undefined;
  error: string | null;
  isLoading: boolean;
  onNext: () => void;
  onPrevious: () => void;
}) {
  if (isLoading) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState message={error} />;
  }
  if (!data || data.results.length === 0) {
    return <EmptyState message="Recorded purchases and their costs will appear here." />;
  }
  return (
    <>
      <div className="divide-y divide-[#edf1ed]">
        {data.results.map((purchase) => (
          <article
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6"
            key={purchase.id}
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {purchase.supplier_name}
                {purchase.invoice_number ? ` · ${purchase.invoice_number}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(purchase.purchase_date)}
                {purchase.recorded_by_name
                  ? ` · Recorded by ${purchase.recorded_by_name}`
                  : ""}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {purchase.lines
                  .map(
                    (line) =>
                      `${line.product_name}: ${line.quantity} ${line.unit_label} × ${formatMoney(line.unit_cost)}`,
                  )
                  .join(" · ")}
              </p>
            </div>
            <p className="shrink-0 font-semibold text-foreground">
              {formatMoney(purchase.total_cost)}
            </p>
          </article>
        ))}
      </div>
      <Pagination
        count={data.count}
        next={data.next}
        onNext={onNext}
        onPrevious={onPrevious}
        previous={data.previous}
      />
    </>
  );
}

function MovementTab({
  data,
  error,
  isLoading,
  onNext,
  onPrevious,
}: {
  data: PaginatedResponse<StockMovement> | undefined;
  error: string | null;
  isLoading: boolean;
  onNext: () => void;
  onPrevious: () => void;
}) {
  if (isLoading) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState message={error} />;
  }
  if (!data || data.results.length === 0) {
    return <EmptyState message="Stock purchases, usage, and adjustments will be recorded here." />;
  }
  return (
    <>
      <div className="divide-y divide-[#edf1ed]">
        {data.results.map((movement) => (
          <article
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            key={movement.id}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">
                  {movement.product_name}
                </p>
                <MovementBadge type={movement.movement_type} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(movement.occurred_at)}
                {movement.supplier_name ? ` · ${movement.supplier_name}` : ""}
                {movement.invoice_number ? ` · ${movement.invoice_number}` : ""}
                {movement.recorded_by_name
                  ? ` · Recorded by ${movement.recorded_by_name}`
                  : ""}
              </p>
              {movement.reason && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {movement.reason}
                </p>
              )}
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="font-semibold text-foreground">
                {movement.quantity} {movement.unit_label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Value {formatMoney(movement.value_change)}
              </p>
            </div>
          </article>
        ))}
      </div>
      <Pagination
        count={data.count}
        next={data.next}
        onNext={onNext}
        onPrevious={onPrevious}
        previous={data.previous}
      />
    </>
  );
}

function ReportsTab({
  endDate,
  movementData,
  movementError,
  movementLoading,
  onEndDateChange,
  onReportDateChange,
  onStartDateChange,
  reportDate,
  startDate,
  valuationData,
  valuationError,
  valuationLoading,
}: {
  endDate: string;
  movementData: import("./types").InventoryMovementReport | undefined;
  movementError: string | null;
  movementLoading: boolean;
  onEndDateChange: (value: string) => void;
  onReportDateChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  reportDate: string;
  startDate: string;
  valuationData: import("./types").InventoryValuationReport | undefined;
  valuationError: string | null;
  valuationLoading: boolean;
}) {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-[#edf1ed] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Current valuation</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Moving weighted-average stock value as of the selected date.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-4" />
            <Input
              aria-label="Valuation as of date"
              className="h-10 w-40 rounded-xl"
              onChange={(event) => onReportDateChange(event.target.value)}
              type="date"
              value={reportDate}
            />
          </label>
        </div>
        {valuationError ? (
          <InlineError message={valuationError} />
        ) : valuationLoading ? (
          <LoadingState />
        ) : valuationData ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ReportMetric
                label="Total stock value"
                value={formatMoney(valuationData.total_stock_value)}
              />
              <ReportMetric
                label="Low-stock items"
                value={String(valuationData.low_stock_count)}
              />
            </div>
            <div className="mt-4 divide-y divide-[#edf1ed]">
              {valuationData.items.map((item) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  key={item.product}
                >
                  <span className="font-medium text-foreground">
                    {item.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {item.category}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {item.quantity_on_hand} {item.unit_label} ·{" "}
                    {formatMoney(item.stock_value)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#edf1ed] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Purchases and usage</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Movement totals and cost over the selected date range.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Report start date"
              className="h-10 w-40 rounded-xl"
              onChange={(event) => onStartDateChange(event.target.value)}
              type="date"
              value={startDate}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              aria-label="Report end date"
              className="h-10 w-40 rounded-xl"
              onChange={(event) => onEndDateChange(event.target.value)}
              type="date"
              value={endDate}
            />
          </div>
        </div>
        {movementError ? (
          <InlineError message={movementError} />
        ) : movementLoading ? (
          <LoadingState />
        ) : movementData ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <ReportMetric
                label="Purchase costs"
                value={formatMoney(movementData.total_purchase_cost)}
              />
              <ReportMetric
                label="Usage costs"
                value={formatMoney(movementData.total_usage_cost)}
              />
              <ReportMetric
                label="Stock movements"
                value={String(movementData.movement_count)}
              />
            </div>
            <div className="mt-4 divide-y divide-[#edf1ed]">
              {movementData.items.map((item) => (
                <div
                  className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                  key={item.product}
                >
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className="text-muted-foreground">
                    Bought {item.purchased_quantity} ({formatMoney(item.purchase_cost)})
                  </span>
                  <span className="text-muted-foreground">
                    Used {item.used_quantity} ({formatMoney(item.usage_cost)})
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function Pagination({
  count,
  next,
  onNext,
  onPrevious,
  previous,
}: {
  count: number;
  next: string | null;
  onNext: () => void;
  onPrevious: () => void;
  previous: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[#edf1ed] px-4 py-3 sm:px-6">
      <p className="text-xs text-muted-foreground">{count} record{count === 1 ? "" : "s"}</p>
      <div className="flex gap-2">
        <Button
          aria-label="Previous page"
          disabled={!previous}
          onClick={onPrevious}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label="Next page"
          disabled={!next}
          onClick={onNext}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f7f9f7] p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-[#17261d]">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function MovementBadge({ type }: { type: StockMovement["movement_type"] }) {
  const label =
    type === "PURCHASE"
      ? "Purchase"
      : type === "USAGE"
        ? "Usage"
        : "Adjustment";
  return (
    <span className="rounded-full bg-[#edf5ef] px-2.5 py-1 text-xs font-medium text-primary">
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
      <Boxes aria-hidden="true" className="size-4 animate-pulse" />
      Loading inventory…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <AlertTriangle aria-hidden="true" className="size-6 text-destructive" />
      <p className="text-sm text-destructive" role="alert">{message}</p>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-4 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <Package aria-hidden="true" className="size-7 text-muted-foreground" />
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  error,
  isSaving,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      description={description}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open
      title={title}
    >
      <div className="space-y-5">
        {error && <InlineError message={error} />}
        <div className="flex justify-end gap-3 border-t border-[#edf1ed] pt-4">
          <Button
            disabled={isSaving}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={isSaving}
            onClick={onConfirm}
            type="button"
            variant="destructive"
          >
            {isSaving ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

async function invalidateInventoryQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inventory-products"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-product-options"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-low-stock-count"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-purchases"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-valuation-report"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-movement-report"] }),
  ]);
}

function getInventoryErrorMessage(error: unknown) {
  if (!isAxiosError(error)) {
    return "The inventory request failed. Please try again.";
  }
  const data = error.response?.data;
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    if (typeof body.detail === "string") {
      return body.detail;
    }
    for (const [field, value] of Object.entries(body)) {
      if (typeof value === "string") {
        return value;
      }
      if (Array.isArray(value) && typeof value[0] === "string") {
        return `${field}: ${value[0]}`;
      }
    }
  }
  return error.message || "The inventory request failed. Please try again.";
}
