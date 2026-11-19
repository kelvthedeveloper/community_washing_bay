import type { InputHTMLAttributes } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { Worker, WorkerWritePayload } from "./types";

const employmentDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid employment date.");

const workerSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Enter the worker's full name.")
    .max(150, "Name must be 150 characters or fewer."),
  phone_number: z
    .string()
    .trim()
    .min(1, "Enter a phone number.")
    .max(32, "Phone number must be 32 characters or fewer.")
    .regex(
      /^[+\d().\-\s]+$/,
      "Use only digits, spaces, and common phone number punctuation.",
    )
    .refine((value) => /\d/.test(value), "Phone number must contain a digit."),
  address: z.string().max(2000, "Address is too long."),
  employment_date: employmentDateSchema,
  is_active: z.boolean(),
  notes: z.string().max(5000, "Notes are too long."),
});

type WorkerFormValues = z.infer<typeof workerSchema>;

interface WorkerFormDialogProps {
  open: boolean;
  worker: Worker | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: WorkerWritePayload) => void;
  isSaving: boolean;
  error: string | null;
}

export function WorkerFormDialog({
  open,
  worker,
  onOpenChange,
  onSubmit,
  isSaving,
  error,
}: WorkerFormDialogProps) {
  const form = useForm<WorkerFormValues>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      full_name: worker?.full_name ?? "",
      phone_number: worker?.phone_number ?? "",
      address: worker?.address ?? "",
      employment_date: worker?.employment_date ?? "",
      is_active: worker?.is_active ?? true,
      notes: worker?.notes ?? "",
    },
  });

  return (
    <Dialog
      description="Worker records are separate from application login accounts."
      onOpenChange={onOpenChange}
      open={open}
      title={`${worker ? "Edit" : "Register"} worker`}
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) => onSubmit(values))}
      >
        {error && <FormError message={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            autoComplete="name"
            error={form.formState.errors.full_name?.message}
            id="worker-full-name"
            label="Full name"
            maxLength={150}
            placeholder="Enter full name"
            {...form.register("full_name")}
          />
          <TextField
            autoComplete="tel"
            error={form.formState.errors.phone_number?.message}
            id="worker-phone-number"
            inputMode="tel"
            label="Phone number"
            maxLength={32}
            placeholder="+1 555 0100"
            {...form.register("phone_number")}
          />
        </div>
        <TextField
          autoComplete="street-address"
          error={form.formState.errors.address?.message}
          id="worker-address"
          label="Address (optional)"
          maxLength={2000}
          placeholder="Enter address"
          {...form.register("address")}
        />
        <TextField
          error={form.formState.errors.employment_date?.message}
          id="worker-employment-date"
          label="Employment date"
          type="date"
          {...form.register("employment_date")}
        />
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="worker-notes"
          >
            Notes (optional)
          </label>
          <Textarea
            aria-invalid={Boolean(form.formState.errors.notes)}
            id="worker-notes"
            maxLength={5000}
            placeholder="Add relevant worker notes"
            {...form.register("notes")}
          />
          <FieldError message={form.formState.errors.notes?.message} />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e7ede7] px-4 py-3">
          <input
            className="mt-0.5 size-4 rounded border-input text-primary focus:ring-ring"
            type="checkbox"
            {...form.register("is_active")}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Active worker
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Inactive workers remain in history but cannot receive new jobs.
            </span>
          </span>
        </label>
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
            {isSaving
              ? "Saving…"
              : worker
                ? "Save changes"
                : "Register worker"}
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
