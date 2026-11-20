import {
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { localDateInputValue } from "@/features/workers/utils";

import type {
  InventoryCategory,
  InventoryProduct,
  InventoryProductWritePayload,
  InventoryPurchaseWritePayload,
  StockTransactionPayload,
  Supplier,
  SupplierWritePayload,
} from "./types";

const productSchema = z.object({
  name: z.string().trim().min(1, "Enter an item name.").max(150),
  sku: z.string().trim().max(64, "SKU must be 64 characters or fewer."),
  category: z.string().min(1, "Choose an inventory category."),
  unit_label: z.string().trim().min(1, "Enter a unit of measure.").max(32),
  low_stock_threshold: z
    .string()
    .regex(/^\d{1,11}(?:\.\d{1,3})?$/, "Enter a non-negative quantity."),
  description: z.string().max(5000, "Description is too long."),
  is_active: z.boolean(),
});

type ProductFormValues = z.infer<typeof productSchema>;

export function InventoryProductDialog({
  open,
  product,
  categories,
  error,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  product: InventoryProduct | null;
  categories: InventoryCategory[];
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: InventoryProductWritePayload) => void;
}) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      category: product?.category ?? "",
      unit_label: product?.unit_label ?? "",
      low_stock_threshold: product?.low_stock_threshold ?? "0.000",
      description: product?.description ?? "",
      is_active: product?.is_active ?? true,
    },
  });

  return (
    <Dialog
      description="Supply types and categories are managed through business settings."
      onOpenChange={onOpenChange}
      open={open}
      title={product ? "Edit inventory item" : "Register inventory item"}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => onSubmit(values))}
      >
        {error && <FormError message={error} />}
        <TextField
          error={form.formState.errors.name?.message}
          id="inventory-product-name"
          label="Item name"
          placeholder="e.g. Concentrated shampoo"
          {...form.register("name")}
        />
        <TextField
          error={form.formState.errors.sku?.message}
          id="inventory-product-sku"
          label="SKU (optional)"
          {...form.register("sku")}
        />
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="inventory-product-category"
          >
            Category
          </label>
          <select
            aria-invalid={Boolean(form.formState.errors.category)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            id="inventory-product-category"
            {...form.register("category")}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option
                disabled={
                  !category.is_active && product?.category !== category.id
                }
                key={category.id}
                value={category.id}
              >
                {category.name}{category.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
          <FieldError message={form.formState.errors.category?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            error={form.formState.errors.unit_label?.message}
            id="inventory-product-unit"
            label="Unit of measure"
            placeholder="L, kg, bottle, etc."
            {...form.register("unit_label")}
          />
          <TextField
            error={form.formState.errors.low_stock_threshold?.message}
            id="inventory-product-threshold"
            inputMode="decimal"
            label="Low-stock threshold"
            {...form.register("low_stock_threshold")}
          />
        </div>
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="inventory-product-description"
          >
            Description (optional)
          </label>
          <Textarea
            id="inventory-product-description"
            maxLength={5000}
            {...form.register("description")}
          />
        </div>
        {product && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              {...form.register("is_active")}
            />
            Item is active
          </label>
        )}
        <FormActions
          isSaving={isSaving}
          onCancel={() => onOpenChange(false)}
          submitLabel={product ? "Save item" : "Register item"}
        />
      </form>
    </Dialog>
  );
}

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter a supplier name.").max(150),
  contact_name: z.string().max(150),
  phone_number: z.string().max(32),
  email: z.union([z.literal(""), z.string().email("Enter a valid email address.")]),
  address: z.string().max(5000),
  notes: z.string().max(5000),
  is_active: z.boolean(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export function SupplierDialog({
  open,
  supplier,
  error,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  supplier: Supplier | null;
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: SupplierWritePayload) => void;
}) {
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      contact_name: supplier?.contact_name ?? "",
      phone_number: supplier?.phone_number ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      notes: supplier?.notes ?? "",
      is_active: supplier?.is_active ?? true,
    },
  });

  return (
    <Dialog
      description="Supplier details are preserved with historical purchases."
      onOpenChange={onOpenChange}
      open={open}
      title={supplier ? "Edit supplier" : "Register supplier"}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => onSubmit(values))}
      >
        {error && <FormError message={error} />}
        <TextField
          error={form.formState.errors.name?.message}
          id="inventory-supplier-name"
          label="Supplier name"
          {...form.register("name")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            error={form.formState.errors.contact_name?.message}
            id="inventory-supplier-contact"
            label="Contact person"
            {...form.register("contact_name")}
          />
          <TextField
            error={form.formState.errors.phone_number?.message}
            id="inventory-supplier-phone"
            label="Phone number"
            {...form.register("phone_number")}
          />
        </div>
        <TextField
          error={form.formState.errors.email?.message}
          id="inventory-supplier-email"
          label="Email"
          type="email"
          {...form.register("email")}
        />
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="inventory-supplier-address"
          >
            Address
          </label>
          <Textarea
            id="inventory-supplier-address"
            {...form.register("address")}
          />
        </div>
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="inventory-supplier-notes"
          >
            Notes
          </label>
          <Textarea
            id="inventory-supplier-notes"
            {...form.register("notes")}
          />
        </div>
        {supplier && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              {...form.register("is_active")}
            />
            Supplier is active
          </label>
        )}
        <FormActions
          isSaving={isSaving}
          onCancel={() => onOpenChange(false)}
          submitLabel={supplier ? "Save supplier" : "Register supplier"}
        />
      </form>
    </Dialog>
  );
}

interface PurchaseLineDraft {
  product: string;
  quantity: string;
  unit_cost: string;
}

export function PurchaseDialog({
  open,
  initialProductId,
  products,
  suppliers,
  error,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initialProductId?: string;
  products: InventoryProduct[];
  suppliers: Supplier[];
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: InventoryPurchaseWritePayload) => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(localDateInputValue());
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseLineDraft[]>([
    { product: initialProductId ?? "", quantity: "", unit_cost: "" },
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedProductIds = lines.map((line) => line.product);
    if (new Set(selectedProductIds).size !== selectedProductIds.length) {
      setValidationError("Each item may only appear once per purchase.");
      return;
    }
    setValidationError(null);
    onSubmit({
      supplier,
      purchase_date: purchaseDate,
      invoice_number: invoiceNumber.trim(),
      notes: notes.trim(),
      lines,
    });
  }

  return (
    <Dialog
      description="Purchase lines are recorded as stock movements and cannot be edited later."
      onOpenChange={onOpenChange}
      open={open}
      title="Record stock purchase"
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && <FormError message={error} />}
        {validationError && <FormError message={validationError} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="purchase-supplier"
            label="Supplier"
            onChange={(event) => setSupplier(event.target.value)}
            required
            value={supplier}
          >
            <option value="">Select supplier</option>
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <TextField
            id="purchase-date"
            label="Purchase date"
            max={localDateInputValue()}
            onChange={(event) => setPurchaseDate(event.target.value)}
            required
            type="date"
            value={purchaseDate}
          />
        </div>
        <TextField
          id="purchase-invoice"
          label="Invoice number (optional)"
          onChange={(event) => setInvoiceNumber(event.target.value)}
          value={invoiceNumber}
        />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Purchased items</p>
            <Button
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { product: "", quantity: "", unit_cost: "" },
                ])
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Add line
            </Button>
          </div>
          {lines.map((line, index) => (
            <div
              className="grid gap-3 rounded-xl border border-[#edf1ed] p-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(90px,0.7fr)_minmax(100px,0.8fr)_auto]"
              key={index}
            >
              <SelectField
                id={`purchase-product-${index}`}
                label="Inventory item"
                onChange={(event) =>
                  setLines((current) =>
                    current.map((item, lineIndex) =>
                      lineIndex === index
                        ? { ...item, product: event.target.value }
                        : item,
                    ),
                  )
                }
                required
                value={line.product}
              >
                <option value="">Select item</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.unit_label})
                  </option>
                ))}
              </SelectField>
              <TextField
                id={`purchase-quantity-${index}`}
                inputMode="decimal"
                label="Quantity"
                min="0.001"
                onChange={(event) =>
                  setLines((current) =>
                    current.map((item, lineIndex) =>
                      lineIndex === index
                        ? { ...item, quantity: event.target.value }
                        : item,
                    ),
                  )
                }
                required
                step="0.001"
                type="number"
                value={line.quantity}
              />
              <TextField
                id={`purchase-unit-cost-${index}`}
                inputMode="decimal"
                label="Unit cost (GHS)"
                min="0"
                onChange={(event) =>
                  setLines((current) =>
                    current.map((item, lineIndex) =>
                      lineIndex === index
                        ? { ...item, unit_cost: event.target.value }
                        : item,
                    ),
                  )
                }
                required
                step="0.01"
                type="number"
                value={line.unit_cost}
              />
              {lines.length > 1 && (
                <Button
                  aria-label={`Remove purchase line ${index + 1}`}
                  className="self-end"
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_item, lineIndex) => lineIndex !== index),
                    )
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="purchase-notes"
          >
            Notes
          </label>
          <Textarea
            id="purchase-notes"
            maxLength={5000}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </div>
        <FormActions
          isSaving={isSaving}
          onCancel={() => onOpenChange(false)}
          submitLabel="Record purchase"
        />
      </form>
    </Dialog>
  );
}

const stockTransactionSchema = z.object({
  quantity: z.string().trim().min(1, "Enter a quantity."),
  unit_cost: z.string(),
  reason: z.string().trim().min(1, "Enter a reason.").max(1000),
});

type StockTransactionFormValues = z.infer<typeof stockTransactionSchema>;

export function StockTransactionDialog({
  open,
  product,
  type,
  error,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  product: InventoryProduct;
  type: "usage" | "adjustment";
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: StockTransactionPayload) => void;
}) {
  const form = useForm<StockTransactionFormValues>({
    resolver: zodResolver(
      stockTransactionSchema.superRefine((values, context) => {
        const quantity = Number(values.quantity);
        if (!Number.isFinite(quantity) || quantity === 0) {
          context.addIssue({
            code: "custom",
            message: "Quantity must be greater than zero.",
            path: ["quantity"],
          });
        } else if (type === "usage" && quantity < 0) {
          context.addIssue({
            code: "custom",
            message: "Usage quantity must be positive.",
            path: ["quantity"],
          });
        }
        if (
          values.unit_cost &&
          (!/^\d{1,12}(?:\.\d{1,2})?$/.test(values.unit_cost) ||
            Number(values.unit_cost) < 0)
        ) {
          context.addIssue({
            code: "custom",
            message: "Enter a valid non-negative unit cost.",
            path: ["unit_cost"],
          });
        }
        if (type === "usage" && values.unit_cost) {
          context.addIssue({
            code: "custom",
            message: "Usage cost is calculated from the moving average.",
            path: ["unit_cost"],
          });
        }
        if (type === "adjustment" && quantity < 0 && values.unit_cost) {
          context.addIssue({
            code: "custom",
            message: "Decreases use the moving average unit cost.",
            path: ["unit_cost"],
          });
        }
      }),
    ),
    defaultValues: { quantity: "", unit_cost: "", reason: "" },
  });
  const quantity = Number(form.watch("quantity"));

  return (
    <Dialog
      description={
        type === "usage"
          ? `Available: ${product.stock_on_hand} ${product.unit_label}. Usage is costed at the moving weighted average.`
          : `Current stock: ${product.stock_on_hand} ${product.unit_label}. Adjustments are recorded as immutable movements.`
      }
      onOpenChange={onOpenChange}
      open={open}
      title={type === "usage" ? "Record stock usage" : "Adjust stock"}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          const payload: StockTransactionPayload = {
            quantity: values.quantity,
            reason: values.reason,
          };
          if (type === "adjustment" && values.unit_cost) {
            payload.unit_cost = values.unit_cost;
          }
          onSubmit(payload);
        })}
      >
        {error && <FormError message={error} />}
        <TextField
          error={form.formState.errors.quantity?.message}
          id="stock-transaction-quantity"
          inputMode="decimal"
          label={`Quantity (${product.unit_label})${type === "adjustment" ? " (+/-)" : ""}`}
          min={type === "usage" ? "0.001" : undefined}
          step="0.001"
          type="number"
          {...form.register("quantity")}
        />
        {type === "adjustment" && quantity > 0 && (
          <TextField
            error={form.formState.errors.unit_cost?.message}
            id="stock-adjustment-unit-cost"
            inputMode="decimal"
            label={`Unit cost (GHS per ${product.unit_label}; optional)`}
            min="0"
            step="0.01"
            type="number"
            {...form.register("unit_cost")}
          />
        )}
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="stock-transaction-reason"
          >
            Reason
          </label>
          <Textarea
            aria-invalid={Boolean(form.formState.errors.reason)}
            id="stock-transaction-reason"
            maxLength={1000}
            {...form.register("reason")}
          />
          <FieldError message={form.formState.errors.reason?.message} />
        </div>
        <FormActions
          isSaving={isSaving}
          onCancel={() => onOpenChange(false)}
          submitLabel={
            type === "usage" ? "Record usage" : "Record adjustment"
          }
        />
      </form>
    </Dialog>
  );
}

function TextField({
  id,
  label,
  error,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        id={id}
        {...inputProps}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function SelectField({
  id,
  label,
  children,
  ...selectProps
}: {
  id: string;
  label: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <select
        className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
        id={id}
        {...selectProps}
      >
        {children}
      </select>
    </div>
  );
}

function FormActions({
  isSaving,
  onCancel,
  submitLabel,
}: {
  isSaving: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-[#edf1ed] pt-4 sm:flex-row sm:justify-end">
      <Button
        className="rounded-xl"
        disabled={isSaving}
        onClick={onCancel}
        type="button"
        variant="outline"
      >
        Cancel
      </Button>
      <Button className="rounded-xl" disabled={isSaving} type="submit">
        {isSaving ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p className="text-xs font-medium text-destructive" id={id} role="alert">
      {message}
    </p>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      {message}
    </div>
  );
}
