import { useState, type InputHTMLAttributes } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDateTime,
  formatMoney,
  localDateInputValue,
} from "@/features/workers/utils";

import type {
  Expense,
  ExpenseCategory,
  ExpenseHistoryEntry,
  ExpensePaymentMethod,
  ExpenseWritePayload,
} from "./types";

const paymentMethods: Array<{ value: ExpensePaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
];

const expenseSchema = z.object({
  category: z.string().min(1, "Choose an expense category."),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals.")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero."),
  description: z
    .string()
    .trim()
    .min(1, "Enter an expense description.")
    .max(4000, "Description must be 4,000 characters or fewer."),
  expense_date: z.string().refine(isValidDate, "Enter a valid expense date."),
  payment_method: z.enum([
    "CASH",
    "MOBILE_MONEY",
    "CARD",
    "BANK_TRANSFER",
  ]),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

export function ExpenseDialog({
  open,
  expense,
  categories,
  isSaving,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  expense: Expense | null;
  categories: ExpenseCategory[];
  isSaving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ExpenseWritePayload) => void;
}) {
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: expense?.category ?? "",
      amount: expense?.amount ?? "",
      description: expense?.description ?? "",
      expense_date: expense?.expense_date ?? localDateInputValue(),
      payment_method: expense?.payment_method ?? "CASH",
    },
  });

  return (
    <Dialog
      description={
        expense
          ? "Changes are recorded in the expense audit history. Existing receipts cannot be replaced."
          : "Use an active expense category. The person recording this expense is tracked automatically."
      }
      onOpenChange={onOpenChange}
      open={open}
      title={expense ? "Edit expense" : "Record expense"}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) =>
          onSubmit({ ...values, ...(receipt ? { receipt } : {}) }),
        )}
      >
        {error && <FormError message={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="expense-category"
            >
              Category
            </label>
            <select
              aria-invalid={Boolean(form.formState.errors.category)}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              id="expense-category"
              {...form.register("category")}
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option
                  disabled={
                    !category.is_active && expense?.category !== category.id
                  }
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                  {category.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
            <FieldError message={form.formState.errors.category?.message} />
          </div>
          <TextField
            error={form.formState.errors.amount?.message}
            id="expense-amount"
            inputMode="decimal"
            label="Amount (GHS)"
            min="0.01"
            placeholder="0.00"
            step="0.01"
            type="number"
            {...form.register("amount")}
          />
          <TextField
            error={form.formState.errors.expense_date?.message}
            id="expense-date"
            label="Date"
            type="date"
            {...form.register("expense_date")}
          />
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="expense-payment-method"
            >
              Payment method
            </label>
            <select
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              id="expense-payment-method"
              {...form.register("payment_method")}
            >
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="expense-description"
          >
            Description
          </label>
          <Textarea
            aria-invalid={Boolean(form.formState.errors.description)}
            id="expense-description"
            maxLength={4000}
            placeholder="Describe this expense"
            {...form.register("description")}
          />
          <FieldError message={form.formState.errors.description?.message} />
        </div>
        {!expense?.has_receipt && (
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="expense-receipt"
            >
              Receipt attachment (optional)
            </label>
            <Input
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              id="expense-receipt"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setReceiptError(
                  nextFile && nextFile.size > 10 * 1024 * 1024
                    ? "Receipt files must be 10 MB or smaller."
                    : null,
                );
                setReceipt(
                  nextFile && nextFile.size <= 10 * 1024 * 1024
                    ? nextFile
                    : null,
                );
              }}
              type="file"
            />
            <p className="text-xs text-muted-foreground">
              PDF, PNG, JPEG, or WebP; maximum 10 MB.
            </p>
            <FieldError message={receiptError ?? undefined} />
          </div>
        )}
        {expense?.has_receipt && (
          <p className="rounded-xl bg-[#f7f9f7] px-4 py-3 text-sm text-muted-foreground">
            Receipt already attached: {expense.receipt_name}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 border-t border-[#edf1ed] pt-4 sm:flex-row sm:justify-end">
          <Button
            className="rounded-xl"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={isSaving} type="submit">
            {isSaving ? "Saving…" : expense ? "Save changes" : "Record expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ExpenseCancelDialog({
  open,
  expense,
  isSaving,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  expense: Expense | null;
  isSaving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  return (
    <Dialog
      description="This record will remain in the ledger and audit history. Its amount will no longer count toward expense reports."
      onOpenChange={onOpenChange}
      open={open}
      title="Cancel expense"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedReason = reason.trim();
          if (!trimmedReason) {
            setValidationError("Enter a reason for cancelling this expense.");
            return;
          }
          setValidationError(null);
          onConfirm(trimmedReason);
        }}
      >
        {expense && (
          <p className="rounded-xl bg-[#f7f9f7] px-4 py-3 text-sm">
            {expense.category_name} · {formatMoney(expense.amount)} ·{" "}
            {expense.description}
          </p>
        )}
        {error && <FormError message={error} />}
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="expense-cancellation-reason"
          >
            Cancellation reason
          </label>
          <Textarea
            aria-invalid={Boolean(validationError)}
            id="expense-cancellation-reason"
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          <FieldError message={validationError ?? undefined} />
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-[#edf1ed] pt-4 sm:flex-row sm:justify-end">
          <Button
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Keep expense
          </Button>
          <Button disabled={isSaving} type="submit" variant="destructive">
            {isSaving ? "Cancelling…" : "Cancel expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ExpenseHistoryDialog({
  open,
  expense,
  history,
  isLoading,
  error,
  onOpenChange,
}: {
  open: boolean;
  expense: Expense | null;
  history: ExpenseHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      description={expense?.description}
      onOpenChange={onOpenChange}
      open={open}
      title="Expense audit history"
    >
      {error ? (
        <FormError message={error} />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading audit history…
        </p>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No audit history is available.
        </p>
      ) : (
        <ol className="space-y-3">
          {history.map((entry) => (
            <li
              className="rounded-xl border border-[#e7ece7] p-4"
              key={entry.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {eventLabel(entry.event_type)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                By {entry.actor_name ?? "Former user"}
              </p>
              <div className="mt-3 space-y-1 text-sm">
                <SnapshotLine label="Amount" value={formatMoney(entry.after.amount)} />
                <SnapshotLine label="Category" value={entry.after.category_name} />
                <SnapshotLine label="Description" value={entry.after.description} />
                <SnapshotLine label="Date" value={entry.after.expense_date} />
                {entry.event_type === "UPDATED" && entry.before && (
                  <details className="pt-2">
                    <summary className="cursor-pointer text-xs font-medium text-primary">
                      Show previous values
                    </summary>
                    <div className="mt-2 space-y-1 border-l-2 border-[#e4ebe4] pl-3">
                      <SnapshotLine
                        label="Previous amount"
                        value={formatMoney(entry.before.amount)}
                      />
                      <SnapshotLine
                        label="Previous category"
                        value={entry.before.category_name}
                      />
                      <SnapshotLine
                        label="Previous description"
                        value={entry.before.description}
                      />
                    </div>
                  </details>
                )}
                {entry.event_type === "CANCELLED" && (
                  <SnapshotLine
                    label="Cancellation reason"
                    value={entry.after.cancellation_reason}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

function SnapshotLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="break-words">
      <span className="font-medium">{label}:</span>{" "}
      <span className="text-muted-foreground">{value || "—"}</span>
    </p>
  );
}

function eventLabel(event: ExpenseHistoryEntry["event_type"]) {
  if (event === "CREATED") {
    return "Expense recorded";
  }
  if (event === "CANCELLED") {
    return "Expense cancelled";
  }
  return "Expense edited";
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
