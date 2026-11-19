import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import type { InputHTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type {
  CommissionSettingRecord,
  ConfigurationRecord,
  ConfigurationWritePayload,
  NamedConfigurationRecord,
  ServicePricingRecord,
} from "./types";
import type { ConfigurationSection } from "./sections";

const namedSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(100, "Names must be 100 characters or fewer."),
  description: z.string().max(5000, "Description is too long."),
  is_active: z.boolean(),
});

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}, "Choose a valid effective date.");

const servicePriceSchema = z
  .string()
  .trim()
  .min(1, "Enter a price.")
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a non-negative amount with up to 2 decimals.")
  .refine((value) => Number.isFinite(Number(value)), "Enter a valid amount.");

const commissionPercentageSchema = z
  .string()
  .trim()
  .min(1, "Enter a commission percentage.")
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/, "Enter a percentage with up to 2 decimals.")
  .refine((value) => Number(value) <= 100, "Percentage cannot exceed 100.");

const servicePricingSchema = z.object({
  vehicle_type: z.string().uuid("Choose a vehicle type."),
  service: z.string().uuid("Choose a service."),
  price: servicePriceSchema,
  effective_date: dateSchema,
  is_active: z.boolean(),
});

const servicePricingStatusSchema = z.object({
  is_active: z.boolean(),
});

const commissionSchema = z.object({
  commission_percentage: commissionPercentageSchema,
  effective_date: dateSchema,
  is_active: z.boolean(),
});

const commissionStatusSchema = z.object({
  is_active: z.boolean(),
});

type NamedFormValues = z.infer<typeof namedSchema>;
type ServicePricingFormValues = z.infer<typeof servicePricingSchema>;
type ServicePricingStatusValues = z.infer<typeof servicePricingStatusSchema>;
type CommissionFormValues = z.infer<typeof commissionSchema>;
type CommissionStatusValues = z.infer<typeof commissionStatusSchema>;

interface ConfigurationDialogProps {
  open: boolean;
  section: ConfigurationSection;
  record: ConfigurationRecord | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ConfigurationWritePayload) => void;
  isSaving: boolean;
  error: string | null;
  vehicleTypes: NamedConfigurationRecord[];
  services: NamedConfigurationRecord[];
  optionsLoading: boolean;
  optionsError: string | null;
}

export function ConfigurationDialog({
  open,
  section,
  record,
  onOpenChange,
  onSubmit,
  isSaving,
  error,
  vehicleTypes,
  services,
  optionsLoading,
  optionsError,
}: ConfigurationDialogProps) {
  const mode = record ? "Edit" : "Add";

  return (
    <Dialog
      description={
        record && section.kind !== "named"
          ? "Historical values are locked. Add a new effective-dated record to change them."
          : section.description
      }
      onOpenChange={onOpenChange}
      open={open}
      title={`${mode} ${section.singular}`}
    >
      {section.kind === "named" && (
        <NamedConfigurationForm
          error={error}
          isSaving={isSaving}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
          record={record && "name" in record ? record : null}
        />
      )}
      {section.kind === "service-pricing" &&
        (record && "price" in record ? (
          <ServicePricingStatusForm
            error={error}
            isSaving={isSaving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            record={record}
          />
        ) : (
          <ServicePricingCreateForm
            error={error}
            isSaving={isSaving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            optionsError={optionsError}
            optionsLoading={optionsLoading}
            services={services}
            vehicleTypes={vehicleTypes}
          />
        ))}
      {section.kind === "commission-settings" &&
        (record && "commission_percentage" in record ? (
          <CommissionStatusForm
            error={error}
            isSaving={isSaving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            record={record}
          />
        ) : (
          <CommissionCreateForm
            error={error}
            isSaving={isSaving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ))}
    </Dialog>
  );
}

function NamedConfigurationForm({
  record,
  onSubmit,
  onCancel,
  isSaving,
  error,
}: {
  record: NamedConfigurationRecord | null;
  onSubmit: (payload: ConfigurationWritePayload) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const form = useForm<NamedFormValues>({
    resolver: zodResolver(namedSchema),
    defaultValues: {
      name: record?.name ?? "",
      description: record?.description ?? "",
      is_active: record?.is_active ?? true,
    },
  });

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <FormError message={error} />
      <TextField
        error={form.formState.errors.name?.message}
        id="configuration-name"
        label="Name"
        maxLength={100}
        placeholder="Enter a name"
        {...form.register("name")}
      />
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="configuration-description"
        >
          Description
        </label>
        <Textarea
          aria-invalid={Boolean(form.formState.errors.description)}
          id="configuration-description"
          maxLength={5000}
          placeholder="Add an optional description"
          {...form.register("description")}
        />
        <FieldError message={form.formState.errors.description?.message} />
      </div>
      <ActiveField register={form.register("is_active")} />
      <FormActions
        isSaving={isSaving}
        onCancel={onCancel}
        submitLabel={record ? "Save changes" : "Create"}
      />
    </form>
  );
}

function ServicePricingCreateForm({
  onSubmit,
  onCancel,
  isSaving,
  error,
  vehicleTypes,
  services,
  optionsLoading,
  optionsError,
}: {
  onSubmit: (payload: ConfigurationWritePayload) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
  vehicleTypes: NamedConfigurationRecord[];
  services: NamedConfigurationRecord[];
  optionsLoading: boolean;
  optionsError: string | null;
}) {
  const form = useForm<ServicePricingFormValues>({
    resolver: zodResolver(servicePricingSchema),
    defaultValues: {
      vehicle_type: "",
      service: "",
      price: "",
      effective_date: "",
      is_active: true,
    },
  });

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <FormError message={error} />
      {optionsError && <FormError message={optionsError} />}
      {optionsLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading vehicle types and services…
        </p>
      )}
      {!optionsLoading && !optionsError && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="pricing-vehicle-type"
            >
              Vehicle type
            </label>
            <select
              aria-invalid={Boolean(form.formState.errors.vehicle_type)}
              className={selectClassName}
              id="pricing-vehicle-type"
              {...form.register("vehicle_type")}
            >
              <option value="">Select a vehicle type</option>
              {vehicleTypes
                .filter((vehicleType) => vehicleType.is_active)
                .map((vehicleType) => (
                  <option key={vehicleType.id} value={vehicleType.id}>
                    {vehicleType.name}
                  </option>
                ))}
            </select>
            <FieldError
              message={form.formState.errors.vehicle_type?.message}
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="pricing-service"
            >
              Service
            </label>
            <select
              aria-invalid={Boolean(form.formState.errors.service)}
              className={selectClassName}
              id="pricing-service"
              {...form.register("service")}
            >
              <option value="">Select a service</option>
              {services
                .filter((service) => service.is_active)
                .map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
            </select>
            <FieldError message={form.formState.errors.service?.message} />
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          error={form.formState.errors.price?.message}
          id="pricing-price"
          inputMode="decimal"
          label="Price"
          maxLength={13}
          placeholder="0.00"
          {...form.register("price")}
        />
        <TextField
          error={form.formState.errors.effective_date?.message}
          id="pricing-effective-date"
          label="Effective date"
          type="date"
          {...form.register("effective_date")}
        />
      </div>
      <ActiveField register={form.register("is_active")} />
      <FormActions
        isSaving={isSaving || optionsLoading}
        onCancel={onCancel}
        submitLabel="Create pricing"
      />
    </form>
  );
}

function ServicePricingStatusForm({
  record,
  onSubmit,
  onCancel,
  isSaving,
  error,
}: {
  record: ServicePricingRecord;
  onSubmit: (payload: ConfigurationWritePayload) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const form = useForm<ServicePricingStatusValues>({
    resolver: zodResolver(servicePricingStatusSchema),
    defaultValues: { is_active: record.is_active },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <FormError message={error} />
      <RecordSummary
        values={[
          ["Vehicle type", record.vehicle_type_name],
          ["Service", record.service_name],
          ["Price", record.price],
          ["Effective date", record.effective_date],
        ]}
      />
      <ActiveField register={form.register("is_active")} />
      <FormActions
        isSaving={isSaving}
        onCancel={onCancel}
        submitLabel="Save status"
      />
    </form>
  );
}

function CommissionCreateForm({
  onSubmit,
  onCancel,
  isSaving,
  error,
}: {
  onSubmit: (payload: ConfigurationWritePayload) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const form = useForm<CommissionFormValues>({
    resolver: zodResolver(commissionSchema),
    defaultValues: {
      commission_percentage: "",
      effective_date: "",
      is_active: true,
    },
  });

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <FormError message={error} />
      <TextField
        error={form.formState.errors.commission_percentage?.message}
        id="commission-percentage"
        inputMode="decimal"
        label="Commission percentage"
        maxLength={6}
        placeholder="0.00"
        {...form.register("commission_percentage")}
      />
      <TextField
        error={form.formState.errors.effective_date?.message}
        id="commission-effective-date"
        label="Effective date"
        type="date"
        {...form.register("effective_date")}
      />
      <ActiveField register={form.register("is_active")} />
      <FormActions
        isSaving={isSaving}
        onCancel={onCancel}
        submitLabel="Create setting"
      />
    </form>
  );
}

function CommissionStatusForm({
  record,
  onSubmit,
  onCancel,
  isSaving,
  error,
}: {
  record: CommissionSettingRecord;
  onSubmit: (payload: ConfigurationWritePayload) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const form = useForm<CommissionStatusValues>({
    resolver: zodResolver(commissionStatusSchema),
    defaultValues: { is_active: record.is_active },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <FormError message={error} />
      <RecordSummary
        values={[
          ["Commission percentage", `${record.commission_percentage}%`],
          ["Effective date", record.effective_date],
        ]}
      />
      <ActiveField register={form.register("is_active")} />
      <FormActions
        isSaving={isSaving}
        onCancel={onCancel}
        submitLabel="Save status"
      />
    </form>
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

function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      {message}
    </div>
  );
}

function ActiveField({
  register,
}: {
  register: UseFormRegisterReturn<"is_active">;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e7ede7] px-4 py-3">
      <input
        className="mt-0.5 size-4 rounded border-input text-primary focus:ring-ring"
        type="checkbox"
        {...register}
      />
      <span>
        <span className="block text-sm font-medium text-foreground">
          Active
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          Inactive records remain available for historical reference.
        </span>
      </span>
    </label>
  );
}

function RecordSummary({ values }: { values: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 rounded-xl bg-[#f6f8f6] p-4 sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
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

const selectClassName =
  "flex h-12 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
