import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { fetchActiveJobOptions } from "./api";
import { getWorkerApiErrorMessage } from "./utils";

const assignmentSchema = z.object({
  vehicle_type: z.string().uuid("Choose a vehicle type."),
  service: z.string().uuid("Choose a service."),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

export function WorkerJobDialog({
  open,
  workerName,
  onOpenChange,
  onSubmit,
  isSaving,
  error,
}: {
  open: boolean;
  workerName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AssignmentFormValues) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const optionsQuery = useQuery({
    queryKey: ["worker-job-options"],
    queryFn: fetchActiveJobOptions,
    staleTime: 30_000,
  });
  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { vehicle_type: "", service: "" },
  });
  const vehicleTypes = optionsQuery.data?.vehicleTypes ?? [];
  const services = optionsQuery.data?.services ?? [];
  const optionsEmpty =
    !optionsQuery.isPending &&
    (vehicleTypes.length === 0 || services.length === 0);

  return (
    <Dialog
      description={`Assign a new job to ${workerName}. Only active workers can receive new jobs.`}
      onOpenChange={onOpenChange}
      open={open}
      title="Assign worker to a job"
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) => onSubmit(values))}
      >
        {error && <FormError message={error} />}
        {optionsQuery.isError && (
          <FormError message={getWorkerApiErrorMessage(optionsQuery.error)} />
        )}
        {optionsQuery.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading active services and vehicle types…
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="job-vehicle-type"
              >
                Vehicle type
              </label>
              <select
                aria-invalid={Boolean(form.formState.errors.vehicle_type)}
                className={selectClassName}
                id="job-vehicle-type"
                {...form.register("vehicle_type")}
              >
                <option value="">Select a vehicle type</option>
                {vehicleTypes.map((vehicleType) => (
                  <option key={vehicleType.id} value={vehicleType.id}>
                    {vehicleType.name}
                  </option>
                ))}
              </select>
              <FieldError message={form.formState.errors.vehicle_type?.message} />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="job-service"
              >
                Service
              </label>
              <select
                aria-invalid={Boolean(form.formState.errors.service)}
                className={selectClassName}
                id="job-service"
                {...form.register("service")}
              >
                <option value="">Select a service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <FieldError message={form.formState.errors.service?.message} />
            </div>
            {optionsEmpty && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Add an active vehicle type and service in Business settings
                before assigning a job.
              </p>
            )}
          </>
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
          <Button
            className="rounded-xl"
            disabled={isSaving || optionsQuery.isPending || optionsQuery.isError || optionsEmpty}
            type="submit"
          >
            {isSaving ? "Assigning…" : "Assign job"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p className="text-xs font-medium text-destructive" role="alert">
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

const selectClassName =
  "flex h-12 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
