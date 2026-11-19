import type { InputHTMLAttributes } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { CommissionPaymentWritePayload } from "./types";
import { formatMoney, localDateInputValue } from "./utils";

const paymentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a positive amount with up to 2 decimals.")
    .refine((value) => Number(value) > 0, "Payment must be greater than zero."),
  payment_date: z.string().refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value <= localDateInputValue()
    );
  }, "Enter a valid payment date that is not in the future."),
  notes: z.string().max(1000, "Notes must be 1,000 characters or fewer."),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export function WorkerPaymentDialog({
  open,
  outstanding,
  onOpenChange,
  onSubmit,
  isSaving,
  error,
}: {
  open: boolean;
  outstanding: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CommissionPaymentWritePayload) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(
      paymentSchema.refine(
        (values) => Number(values.amount) <= Number(outstanding),
        {
          message: "Payment cannot exceed the outstanding commission.",
          path: ["amount"],
        },
      ),
    ),
    defaultValues: {
      amount: "",
      payment_date: localDateInputValue(),
      notes: "",
    },
  });

  return (
    <Dialog
      description={`Outstanding commission: ${formatMoney(outstanding)}.`}
      onOpenChange={onOpenChange}
      open={open}
      title="Record commission payment"
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) => onSubmit(values))}
      >
        {error && <FormError message={error} />}
        <TextField
          error={form.formState.errors.amount?.message}
          id="commission-payment-amount"
          inputMode="decimal"
          label="Payment amount"
          max={outstanding}
          min="0.01"
          placeholder="0.00"
          step="0.01"
          type="number"
          {...form.register("amount")}
        />
        <TextField
          error={form.formState.errors.payment_date?.message}
          id="commission-payment-date"
          label="Payment date"
          max={localDateInputValue()}
          type="date"
          {...form.register("payment_date")}
        />
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="commission-payment-notes"
          >
            Notes (optional)
          </label>
          <Textarea
            aria-invalid={Boolean(form.formState.errors.notes)}
            id="commission-payment-notes"
            maxLength={1000}
            placeholder="Add a reference or note"
            {...form.register("notes")}
          />
          <FieldError message={form.formState.errors.notes?.message} />
        </div>
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
            {isSaving ? "Saving…" : "Record payment"}
          </Button>
        </div>
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
