import type { InputHTMLAttributes } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { CommissionLedgerWritePayload } from "./types";
import { localDateInputValue } from "./utils";

const adjustmentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(
      /^-?\d{1,10}(?:\.\d{1,2})?$/,
      "Enter a signed amount with up to 2 decimals.",
    )
    .refine((value) => Number(value) !== 0, "Adjustment cannot be zero."),
  effective_date: z.string().refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value <= localDateInputValue()
    );
  }, "Enter a valid effective date that is not in the future."),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required.")
    .max(1000, "Reason must be 1,000 characters or fewer."),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;
type AdjustmentPayload = Extract<
  CommissionLedgerWritePayload,
  { entry_type: "ADJUSTMENT" }
>;

export function WorkerCommissionAdjustmentDialog({
  open,
  onOpenChange,
  onSubmit,
  isSaving,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AdjustmentPayload) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      amount: "",
      effective_date: localDateInputValue(),
      reason: "",
    },
  });

  return (
    <Dialog
      description="Corrections are append-only. Use a positive amount to credit commission or a negative amount to reduce it."
      onOpenChange={onOpenChange}
      open={open}
      title="Add commission adjustment"
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) =>
          onSubmit({ entry_type: "ADJUSTMENT", ...values }),
        )}
      >
        {error && <FormError message={error} />}
        <TextField
          error={form.formState.errors.amount?.message}
          id="commission-adjustment-amount"
          inputMode="decimal"
          label="Signed amount (GHS)"
          placeholder="e.g. 1.25 or -1.25"
          {...form.register("amount")}
        />
        <TextField
          error={form.formState.errors.effective_date?.message}
          id="commission-adjustment-date"
          label="Effective date"
          max={localDateInputValue()}
          type="date"
          {...form.register("effective_date")}
        />
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="commission-adjustment-reason"
          >
            Reason
          </label>
          <Textarea
            aria-invalid={Boolean(form.formState.errors.reason)}
            id="commission-adjustment-reason"
            maxLength={1000}
            placeholder="Describe the approved correction"
            {...form.register("reason")}
          />
          <FieldError message={form.formState.errors.reason?.message} />
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
            {isSaving ? "Saving…" : "Record adjustment"}
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
