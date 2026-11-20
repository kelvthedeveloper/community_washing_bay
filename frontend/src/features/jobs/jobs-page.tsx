import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { getRoleHomePath } from "@/features/auth/protected-route";
import type { BusinessRole } from "@/features/auth/types";
import { getWorkerApiErrorMessage, formatDate, formatDateTime, formatMoney, localDateInputValue } from "@/features/workers/utils";
import { confirmAction } from "@/lib/sweet-alert";

import {
  createSale,
  createJobPayment,
  createJobRefund,
  fetchJobOptions,
  fetchJobPayments,
  fetchJobRefunds,
  fetchJobQuote,
  fetchJobs,
  searchVehicles,
  transitionJob,
} from "./api";
import type { Job, JobRefund, JobStatus, PaymentMethod } from "./types";

const pageSize = 10;

export function JobsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [jobDate, setJobDate] = useState(localDateInputValue());
  const [isCreating, setIsCreating] = useState(false);
  const [payingJob, setPayingJob] = useState<Job | null>(null);
  const [refundingJob, setRefundingJob] = useState<Job | null>(null);
  const [viewingPaymentsFor, setViewingPaymentsFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: ["jobs", page, search, jobDate],
    queryFn: () =>
      fetchJobs({
        page,
        page_size: pageSize,
        search,
        job_date: jobDate,
      }),
  });
  const optionsQuery = useQuery({
    queryKey: ["job-options"],
    queryFn: fetchJobOptions,
    enabled: isCreating,
  });
  const paymentsQuery = useQuery({
    queryKey: ["job-payments", viewingPaymentsFor],
    queryFn: () => fetchJobPayments(viewingPaymentsFor ?? ""),
    enabled: Boolean(viewingPaymentsFor),
  });
  const refundsQuery = useQuery({
    queryKey: ["job-refunds", viewingPaymentsFor],
    queryFn: () => fetchJobRefunds(viewingPaymentsFor ?? ""),
    enabled: Boolean(viewingPaymentsFor),
  });

  const createMutation = useMutation({
    mutationFn: (values: { payload: Parameters<typeof createSale>[0]; key: string }) =>
      createSale(values.payload, values.key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["workers"] });
      setIsCreating(false);
      setNotice("Washing job registered.");
    },
  });
  const transitionMutation = useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: "start" | "complete" | "cancel" }) =>
      transitionJob(jobId, action),
    onSuccess: async (_job, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["worker-jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["worker-commission-summary"] }),
      ]);
      setNotice(
        variables.action === "start"
          ? "Washing started."
          : variables.action === "complete"
            ? "Job completed and worker commission accrued."
            : "Job cancelled.",
      );
    },
  });
  const paymentMutation = useMutation({
    mutationFn: (values: {
      jobId: string;
      amount: string;
      method: PaymentMethod;
      payment_date: string;
      notes: string;
      key: string;
    }) =>
      createJobPayment(values.jobId, {
        amount: values.amount,
        method: values.method,
        payment_date: values.payment_date,
        notes: values.notes,
      }, values.key),
    onSuccess: async (_payment, values) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["job-payments", values.jobId] }),
      ]);
      setPayingJob(null);
      setNotice("Customer payment recorded.");
    },
  });
  const refundMutation = useMutation({
    mutationFn: (values: {
      jobId: string;
      payment: string;
      amount: string;
      refund_date: string;
      reason: string;
      key: string;
    }) =>
      createJobRefund(
        values.jobId,
        {
          payment: values.payment,
          amount: values.amount,
          refund_date: values.refund_date,
          reason: values.reason,
        },
        values.key,
      ),
    onSuccess: async (_refund, values) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["job-payments", values.jobId] }),
        queryClient.invalidateQueries({ queryKey: ["job-refunds", values.jobId] }),
        queryClient.invalidateQueries({ queryKey: ["job-receipt", values.jobId] }),
        queryClient.invalidateQueries({ queryKey: ["owner-report"] }),
      ]);
      setRefundingJob(null);
      setNotice("Refund recorded.");
    },
  });

  async function performTransition(job: Job, action: "start" | "complete" | "cancel") {
    const prompts = {
      start: "Start washing this vehicle?",
      complete: "Mark this washing job as completed?",
      cancel: "Cancel this washing job? No worker commission will be accrued.",
    };
    const confirmed = await confirmAction({
      title: prompts[action],
      confirmButtonText:
        action === "cancel"
          ? "Cancel job"
          : action === "complete"
            ? "Complete job"
            : "Start washing",
      destructive: action === "cancel",
    });
    if (confirmed) {
      transitionMutation.mutate({ jobId: job.id, action });
    }
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-9">
          <div className="flex items-center gap-5">
            <BrandMark compact />
            <div className="hidden border-l border-[#e6ece6] pl-5 sm:block">
              <p className="text-sm font-semibold text-foreground">Point of sale</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Sales, payments, and receipts</p>
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
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            <Check aria-hidden="true" className="size-4" />
            {notice}
            <button className="ml-auto underline" onClick={() => setNotice(null)} type="button">
              Dismiss
            </button>
          </div>
        )}

        <section className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Operations</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#17261d] sm:text-3xl">
                Point of sale
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Register vehicles and washing services, take payments, and track outstanding balances.
              </p>
            </div>
            <Button className="rounded-xl" onClick={() => {
              createMutation.reset();
              setIsCreating(true);
            }}>
              <Plus aria-hidden="true" className="size-4" />
              New sale
            </Button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative">
              <span className="sr-only">Search number plate</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-xl pl-9"
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Search number plate"
                value={search}
              />
            </label>
            <label className="relative">
              <span className="sr-only">Filter by job date</span>
              <CalendarDays aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Filter by job date"
                className="h-11 rounded-xl pl-9"
                onChange={(event) => {
                  setPage(1);
                  setJobDate(event.target.value);
                }}
                type="date"
                value={jobDate}
              />
            </label>
          </div>
          {transitionMutation.isError && (
            <InlineError message={getWorkerApiErrorMessage(transitionMutation.error)} />
          )}
          {jobsQuery.isPending ? (
            <LoadingState />
          ) : jobsQuery.isError ? (
            <InlineError message={getWorkerApiErrorMessage(jobsQuery.error)} />
          ) : jobsQuery.data.results.length === 0 ? (
            <div className="py-12 text-center">
              <CarFront aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">No jobs found</p>
              <p className="mt-1 text-sm text-muted-foreground">Try another date or register a new job.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {jobsQuery.data.results.map((job) => (
                <article className="rounded-xl border border-[#e7ece7] p-4 sm:p-5" key={job.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-foreground">{job.number_plate || "Legacy job"}</h2>
                        <StatusBadge status={job.status} />
                        <span className="text-xs text-muted-foreground">{job.vehicle_type_name}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(job.job_date)} · Registered {formatDateTime(job.registered_at)}
                      </p>
                      <p className="mt-3 text-sm text-foreground">
                        {job.services.map((service) => `${service.service_name} (${formatMoney(service.price_snapshot)})`).join(" · ")}
                      </p>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserRound aria-hidden="true" className="size-3.5" />
                        {job.assigned_workers.map((worker) => worker.worker_name).join(", ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 lg:justify-end">
                      <MoneyDetail label="Total" value={job.total_price} />
                      <MoneyDetail label="Net paid" value={job.amount_paid} />
                      <MoneyDetail label="Due" value={job.amount_due} />
                      {job.status === "PENDING" && (
                        <Button className="rounded-lg" disabled={transitionMutation.isPending} onClick={() => performTransition(job, "start")} size="sm">
                          Start washing
                        </Button>
                      )}
                      {job.status === "IN_PROGRESS" && (
                        <Button className="rounded-lg" disabled={transitionMutation.isPending} onClick={() => performTransition(job, "complete")} size="sm">
                          Complete
                        </Button>
                      )}
                      {(job.status === "PENDING" || job.status === "IN_PROGRESS") && (
                        <Button className="rounded-lg" disabled={transitionMutation.isPending} onClick={() => performTransition(job, "cancel")} size="sm" variant="outline">
                          Cancel
                        </Button>
                      )}
                      {job.status !== "CANCELLED" && Number(job.amount_due) > 0 && (
                        <Button className="rounded-lg" onClick={() => {
                          paymentMutation.reset();
                          setPayingJob(job);
                        }} size="sm" variant="outline">
                          <CircleDollarSign aria-hidden="true" className="size-4" />
                          Record payment
                        </Button>
                      )}
                      {user.role !== "MANAGER" && Number(job.amount_paid) > 0 && (
                        <Button
                          className="rounded-lg"
                          onClick={() => {
                            refundMutation.reset();
                            setRefundingJob(job);
                            setViewingPaymentsFor(job.id);
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Issue refund
                        </Button>
                      )}
                      <Button asChild className="rounded-lg" size="sm" variant="ghost">
                        <Link to={`/workspace/jobs/${job.id}/receipt`}>Receipt</Link>
                      </Button>
                      <Button
                        className="rounded-lg"
                        onClick={() => setViewingPaymentsFor(viewingPaymentsFor === job.id ? null : job.id)}
                        size="sm"
                        variant="ghost"
                      >
                        {viewingPaymentsFor === job.id ? "Hide payments" : "Payments"}
                      </Button>
                    </div>
                  </div>
                  {viewingPaymentsFor === job.id && (
                    <div className="mt-4 border-t border-[#edf1ed] pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment history</h3>
                      {paymentsQuery.isPending || refundsQuery.isPending ? (
                        <p className="mt-2 text-sm text-muted-foreground">Loading payment history…</p>
                      ) : paymentsQuery.isError ? (
                        <InlineError message={getWorkerApiErrorMessage(paymentsQuery.error)} />
                      ) : refundsQuery.isError ? (
                        <InlineError message={getWorkerApiErrorMessage(refundsQuery.error)} />
                      ) : (
                        <FinancialHistory
                          payments={paymentsQuery.data.results}
                          refunds={refundsQuery.data.results}
                        />
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {jobsQuery.data && jobsQuery.data.count > pageSize && (
            <div className="mt-4 flex items-center justify-between border-t border-[#edf1ed] pt-4">
              <p className="text-xs text-muted-foreground">{jobsQuery.data.count} jobs</p>
              <div className="flex gap-2">
                <Button aria-label="Previous page" className="size-9 rounded-lg" disabled={!jobsQuery.data.previous} onClick={() => setPage((value) => Math.max(1, value - 1))} size="icon" variant="outline">
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </Button>
                <Button aria-label="Next page" className="size-9 rounded-lg" disabled={!jobsQuery.data.next} onClick={() => setPage((value) => value + 1)} size="icon" variant="outline">
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </section>
      </main>

      {isCreating && (
        <CreateJobDialog
          error={createMutation.isError ? getWorkerApiErrorMessage(createMutation.error) : null}
          isLoadingOptions={optionsQuery.isPending}
          isSaving={createMutation.isPending}
          onClose={() => {
            setIsCreating(false);
            createMutation.reset();
          }}
          onSubmit={(payload, key) =>
            createMutation.mutate({ payload, key })
          }
          options={optionsQuery.data}
          optionsError={optionsQuery.isError ? getWorkerApiErrorMessage(optionsQuery.error) : null}
          role={user.role}
        />
      )}
      {payingJob && (
        <PaymentDialog
          error={paymentMutation.isError ? getWorkerApiErrorMessage(paymentMutation.error) : null}
          isSaving={paymentMutation.isPending}
          job={payingJob}
          onClose={() => {
            setPayingJob(null);
            paymentMutation.reset();
          }}
          onSubmit={(values) =>
            paymentMutation.mutate({ ...values, jobId: payingJob.id })
          }
        />
      )}
      {refundingJob && (
        <RefundDialog
          error={refundMutation.isError ? getWorkerApiErrorMessage(refundMutation.error) : null}
          isLoadingHistory={paymentsQuery.isPending || refundsQuery.isPending}
          isSaving={refundMutation.isPending}
          job={refundingJob}
          onClose={() => {
            setRefundingJob(null);
            refundMutation.reset();
          }}
          onSubmit={(values) =>
            refundMutation.mutate({ ...values, jobId: refundingJob.id })
          }
          payments={paymentsQuery.data?.results ?? []}
          refunds={refundsQuery.data?.results ?? []}
        />
      )}
    </div>
  );
}

function FinancialHistory({
  payments,
  refunds,
}: {
  payments: Awaited<ReturnType<typeof fetchJobPayments>>["results"];
  refunds: JobRefund[];
}) {
  if (payments.length === 0 && refunds.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No payments or refunds recorded.</p>;
  }
  return (
    <ul className="mt-2 divide-y divide-[#edf1ed]">
      {payments.map((payment) => (
        <li className="flex flex-wrap justify-between gap-2 py-2 text-sm" key={payment.id}>
          <span>
            Payment · {formatDate(payment.payment_date)} · {payment.method.replace("_", " ")}
            {payment.notes ? ` · ${payment.notes}` : ""}
          </span>
          <span className="font-medium">{formatMoney(payment.amount)}</span>
        </li>
      ))}
      {refunds.map((refund) => (
        <li className="flex flex-wrap justify-between gap-2 py-2 text-sm text-red-700" key={refund.id}>
          <span>Refund · {formatDate(refund.refund_date)} · {refund.reason}</span>
          <span className="font-medium">−{formatMoney(refund.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function RefundDialog({
  error,
  isLoadingHistory,
  isSaving,
  job,
  payments,
  refunds,
  onClose,
  onSubmit,
}: {
  error: string | null;
  isLoadingHistory: boolean;
  isSaving: boolean;
  job: Job;
  payments: Awaited<ReturnType<typeof fetchJobPayments>>["results"];
  refunds: JobRefund[];
  onClose: () => void;
  onSubmit: (values: {
    payment: string;
    amount: string;
    refund_date: string;
    reason: string;
    key: string;
  }) => void;
}) {
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [refundDate, setRefundDate] = useState(localDateInputValue());
  const [reason, setReason] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const refundablePayments = payments.map((payment) => {
    const refunded = refunds
      .filter((refund) => refund.payment === payment.id)
      .reduce((total, refund) => total + Number(refund.amount), 0);
    return {
      ...payment,
      remaining: Math.max(0, Number(payment.amount) - refunded).toFixed(2),
    };
  }).filter((payment) => Number(payment.remaining) > 0);
  const selectedPayment = refundablePayments.find((payment) => payment.id === paymentId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPayment || Number(amount) <= 0 || Number(amount) > Number(selectedPayment.remaining)) {
      return;
    }
    const values = {
      payment: paymentId,
      amount,
      refund_date: refundDate,
      reason: reason.trim(),
    };
    const fingerprint = JSON.stringify(values);
    if (request.current?.fingerprint !== fingerprint) {
      request.current = { fingerprint, key: crypto.randomUUID() };
    }
    onSubmit({ ...values, key: request.current.key });
  }

  return (
    <Dialog
      description="Refunds are recorded against a specific payment and cannot be edited or deleted."
      onOpenChange={(open) => !open && onClose()}
      open
      title={`Issue refund · ${job.number_plate}`}
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && <InlineError message={error} />}
        {isLoadingHistory ? (
          <LoadingState />
        ) : refundablePayments.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            No refundable payment balance remains for this job.
          </p>
        ) : (
          <>
            <label className="block space-y-1.5 text-sm font-medium">
              Payment to refund
              <select
                className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm"
                onChange={(event) => {
                  setPaymentId(event.target.value);
                  setAmount("");
                }}
                required
                value={paymentId}
              >
                <option value="">Select a payment</option>
                {refundablePayments.map((payment) => (
                  <option key={payment.id} value={payment.id}>
                    {formatDate(payment.payment_date)} · {payment.method.replace("_", " ")} · refundable {formatMoney(payment.remaining)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Refund amount (GHS)
              <Input
                className="rounded-xl"
                max={selectedPayment?.remaining}
                min="0.01"
                onChange={(event) => setAmount(event.target.value)}
                required
                step="0.01"
                type="number"
                value={amount}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Refund date
              <Input
                className="rounded-xl"
                max={localDateInputValue()}
                onChange={(event) => setRefundDate(event.target.value)}
                required
                type="date"
                value={refundDate}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Reason
              <textarea
                className="min-h-20 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm"
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
            </label>
          </>
        )}
        <div className="flex justify-end gap-3 border-t border-[#edf1ed] pt-4">
          <Button className="rounded-xl" disabled={isSaving} onClick={onClose} type="button" variant="outline">
            Close
          </Button>
          {refundablePayments.length > 0 && (
            <Button className="rounded-xl" disabled={isSaving || isLoadingHistory || !paymentId} type="submit">
              {isSaving ? "Recording refund…" : "Record refund"}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function CreateJobDialog({
  error,
  isLoadingOptions,
  isSaving,
  options,
  optionsError,
  role,
  onClose,
  onSubmit,
}: {
  error: string | null;
  isLoadingOptions: boolean;
  isSaving: boolean;
  options:
    | Awaited<ReturnType<typeof fetchJobOptions>>
    | undefined;
  optionsError: string | null;
  role: BusinessRole;
  onClose: () => void;
  onSubmit: (
    payload: Parameters<typeof createSale>[0],
    idempotencyKey: string,
  ) => void;
}) {
  const [numberPlate, setNumberPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<"NONE" | "PERCENTAGE" | "FIXED">("NONE");
  const [discountValue, setDiscountValue] = useState("0.00");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAmountEdited, setPaymentAmountEdited] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(localDateInputValue());
  const [paymentNotes, setPaymentNotes] = useState("");
  const saleRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const normalizedPlate = numberPlate.trim().toUpperCase();
  const vehicleQuery = useQuery({
    queryKey: ["vehicle-search", normalizedPlate],
    queryFn: () => searchVehicles(normalizedPlate),
    enabled: normalizedPlate.length >= 3,
  });
  const existingVehicle = vehicleQuery.data?.find(
    (vehicle) => vehicle.number_plate === normalizedPlate,
  );
  useEffect(() => {
    if (existingVehicle) {
      setVehicleType(existingVehicle.vehicle_type);
    }
  }, [existingVehicle?.id, existingVehicle?.vehicle_type]);

  const quoteQuery = useQuery({
    queryKey: ["job-quote", vehicleType, serviceIds, discountType, discountValue],
    queryFn: () =>
      fetchJobQuote(vehicleType, serviceIds, discountType, discountValue),
    enabled: Boolean(vehicleType && serviceIds.length && discountValue),
  });
  useEffect(() => {
    if (!paymentAmountEdited && quoteQuery.data) {
      setPaymentAmount(quoteQuery.data.total_price);
    }
  }, [paymentAmountEdited, quoteQuery.data?.total_price]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !normalizedPlate
      || !vehicleType
      || !workerIds.length
      || !serviceIds.length
      || !quoteQuery.data
      || Number(paymentAmount) > Number(quoteQuery.data.total_price)
    ) {
      return;
    }
    const payload: Parameters<typeof createSale>[0] = {
      number_plate: normalizedPlate,
      vehicle_type: vehicleType,
      workers: workerIds,
      services: serviceIds,
      discount_type: discountType,
      discount_value: discountValue,
      initial_payment: {
        amount: paymentAmount || "0.00",
        method: paymentMethod,
        payment_date: paymentDate,
        notes: paymentNotes,
      },
    };
    const fingerprint = JSON.stringify(payload);
    if (saleRequest.current?.fingerprint !== fingerprint) {
      saleRequest.current = {
        fingerprint,
        key: crypto.randomUUID(),
      };
    }
    onSubmit(payload, saleRequest.current.key);
  }

  return (
    <Dialog
      className="max-w-2xl"
      description="Configured prices are verified on the server and saved as permanent sale snapshots."
      onOpenChange={(open) => !open && onClose()}
      open
      title="New POS sale"
    >
      <form className="space-y-5" onSubmit={submit}>
        {optionsError && <InlineError message={optionsError} />}
        {error && <InlineError message={error} />}
        {isLoadingOptions ? (
          <LoadingState />
        ) : options ? (
          <>
            <label className="block space-y-1.5 text-sm font-medium">
              Number plate
              <Input
                autoFocus
                className="rounded-xl"
                maxLength={32}
                onChange={(event) => {
                  setNumberPlate(event.target.value);
                  setVehicleType("");
                }}
                placeholder="e.g. ABC-123"
                required
                value={numberPlate}
              />
            </label>
            {normalizedPlate.length >= 3 && (
              <p className="text-xs text-muted-foreground" role="status">
                {vehicleQuery.isPending
                  ? "Searching vehicle records…"
                  : vehicleQuery.isError
                    ? getWorkerApiErrorMessage(vehicleQuery.error)
                    : existingVehicle
                      ? `Existing vehicle found (${existingVehicle.number_plate}, ${existingVehicle.vehicle_type_name}).`
                      : "New vehicle will be registered with this sale."}
              </p>
            )}
            <label className="block space-y-1.5 text-sm font-medium">
              Vehicle type
              <select className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm" onChange={(event) => setVehicleType(event.target.value)} required value={vehicleType}>
                <option value="">Select a vehicle type</option>
                {options.vehicleTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Assign washers</legend>
              <div className="grid max-h-36 gap-2 overflow-auto rounded-xl border border-[#e7ece7] p-3 sm:grid-cols-2">
                {options.workers.map((worker) => (
                  <label className="flex items-center gap-2 text-sm" key={worker.id}>
                    <input checked={workerIds.includes(worker.id)} onChange={(event) => setWorkerIds((ids) => event.target.checked ? [...ids, worker.id] : ids.filter((id) => id !== worker.id))} type="checkbox" />
                    {worker.full_name}
                  </label>
                ))}
                {options.workers.length === 0 && <p className="text-sm text-muted-foreground">No active workers available.</p>}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Services</legend>
              <div className="grid max-h-36 gap-2 overflow-auto rounded-xl border border-[#e7ece7] p-3 sm:grid-cols-2">
                {options.services.map((service) => (
                  <label className="flex items-center gap-2 text-sm" key={service.id}>
                    <input checked={serviceIds.includes(service.id)} onChange={(event) => setServiceIds((ids) => event.target.checked ? [...ids, service.id] : ids.filter((id) => id !== service.id))} type="checkbox" />
                    {service.name}
                  </label>
                ))}
                {options.services.length === 0 && <p className="text-sm text-muted-foreground">No active services available.</p>}
              </div>
            </fieldset>
            {role !== "MANAGER" && (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <label className="block space-y-1.5 text-sm font-medium">
                  Authorized discount
                  <select
                    className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm"
                    onChange={(event) => {
                      const nextType = event.target.value as "NONE" | "PERCENTAGE" | "FIXED";
                      setDiscountType(nextType);
                      if (nextType === "NONE") {
                        setDiscountValue("0.00");
                      }
                    }}
                    value={discountType}
                  >
                    <option value="NONE">No discount</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </label>
                {discountType !== "NONE" && (
                  <label className="block space-y-1.5 text-sm font-medium">
                    {discountType === "PERCENTAGE" ? "Discount percentage" : "Discount amount (GHS)"}
                    <Input
                      className="rounded-xl"
                      max={discountType === "PERCENTAGE" ? "100" : undefined}
                      min="0"
                      onChange={(event) => setDiscountValue(event.target.value)}
                      required
                      step="0.01"
                      type="number"
                      value={discountValue}
                    />
                  </label>
                )}
              </div>
            )}
            {quoteQuery.isPending && vehicleType && serviceIds.length > 0 && <p className="text-sm text-muted-foreground">Calculating configured price…</p>}
            {quoteQuery.isError && <InlineError message={getWorkerApiErrorMessage(quoteQuery.error)} />}
            {quoteQuery.data && (
              <div className="rounded-xl bg-[#edf5ef] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Server-verified sale breakdown</p>
                <div className="mt-2 space-y-1">
                  {quoteQuery.data.services.map((service) => (
                    <p className="flex justify-between gap-3 text-sm" key={service.id}>
                      <span>{service.name}</span>
                      <span className="text-right">
                        {service.discount_amount !== "0.00" && (
                          <span className="mr-2 text-xs text-muted-foreground line-through">
                            {formatMoney(service.price)}
                          </span>
                        )}
                        {formatMoney(service.total)}
                      </span>
                    </p>
                  ))}
                </div>
                <p className="mt-3 flex justify-between border-t border-emerald-200 pt-3 text-sm">
                  <span>Subtotal</span><span>{formatMoney(quoteQuery.data.subtotal)}</span>
                </p>
                {quoteQuery.data.discount_amount !== "0.00" && (
                  <p className="mt-1 flex justify-between text-sm text-emerald-800">
                    <span>Discount</span><span>−{formatMoney(quoteQuery.data.discount_amount)}</span>
                  </p>
                )}
                <p className="mt-3 flex justify-between border-t border-emerald-200 pt-3 font-semibold">
                  <span>Total</span><span>{formatMoney(quoteQuery.data.total_price)}</span>
                </p>
              </div>
            )}
            {quoteQuery.data && (
              <fieldset className="space-y-3 rounded-xl border border-[#e7ece7] p-4">
                <legend className="px-1 text-sm font-semibold">Payment</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium">
                    Amount received (GHS)
                    <Input
                      className="rounded-xl"
                      max={quoteQuery.data.total_price}
                      min="0"
                      onChange={(event) => {
                        setPaymentAmountEdited(true);
                        setPaymentAmount(event.target.value);
                      }}
                      required
                      step="0.01"
                      type="number"
                      value={paymentAmount}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    Payment method
                    <select
                      className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm"
                      onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                      required={Number(paymentAmount) > 0}
                      value={paymentMethod}
                    >
                      <option value="CASH">Cash</option>
                      <option value="MOBILE_MONEY">Mobile money</option>
                      <option value="CARD">Card</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    Payment date
                    <Input
                      className="rounded-xl"
                      max={localDateInputValue()}
                      onChange={(event) => setPaymentDate(event.target.value)}
                      required
                      type="date"
                      value={paymentDate}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    Payment notes
                    <Input className="rounded-xl" onChange={(event) => setPaymentNotes(event.target.value)} value={paymentNotes} />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Outstanding after this payment: {formatMoney(
                    (Number(quoteQuery.data.total_price) - Number(paymentAmount || 0)).toFixed(2),
                  )}
                </p>
              </fieldset>
            )}
          </>
        ) : null}
        <div className="flex justify-end gap-3 border-t border-[#edf1ed] pt-4">
          <Button className="rounded-xl" disabled={isSaving} onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button
            className="rounded-xl"
            disabled={
              isSaving
              || isLoadingOptions
              || Boolean(optionsError)
              || !quoteQuery.data
              || vehicleQuery.isPending
            }
            type="submit"
          >
            {isSaving ? "Processing sale…" : "Complete sale"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PaymentDialog({
  error,
  isSaving,
  job,
  onClose,
  onSubmit,
}: {
  error: string | null;
  isSaving: boolean;
  job: Job;
  onClose: () => void;
  onSubmit: (values: {
    amount: string;
    method: PaymentMethod;
    payment_date: string;
    notes: string;
    key: string;
  }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(localDateInputValue());
  const [notes, setNotes] = useState("");
  const paymentRequest = useRef<{ fingerprint: string; key: string } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = { amount, method, payment_date: paymentDate, notes };
    const fingerprint = JSON.stringify(values);
    if (paymentRequest.current?.fingerprint !== fingerprint) {
      paymentRequest.current = {
        fingerprint,
        key: crypto.randomUUID(),
      };
    }
    onSubmit({ ...values, key: paymentRequest.current.key });
  }

  return (
    <Dialog description={`Outstanding balance: ${formatMoney(job.amount_due)}`} onOpenChange={(open) => !open && onClose()} open title={`Record payment · ${job.number_plate}`}>
      <form className="space-y-4" onSubmit={submit}>
        {error && <InlineError message={error} />}
        <label className="block space-y-1.5 text-sm font-medium">
          Amount (GHS)
          <Input
            className="rounded-xl"
            inputMode="decimal"
            max={job.amount_due}
            min="0.01"
            onChange={(event) => setAmount(event.target.value)}
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Payment method
          <select
            className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm"
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            required
            value={method}
          >
            <option value="CASH">Cash</option>
            <option value="MOBILE_MONEY">Mobile money</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Payment date
          <Input className="rounded-xl" max={localDateInputValue()} onChange={(event) => setPaymentDate(event.target.value)} required type="date" value={paymentDate} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Notes
          <textarea className="min-h-20 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm" onChange={(event) => setNotes(event.target.value)} value={notes} />
        </label>
        <div className="flex justify-end gap-3 border-t border-[#edf1ed] pt-4">
          <Button className="rounded-xl" disabled={isSaving} onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button className="rounded-xl" disabled={isSaving} type="submit">{isSaving ? "Saving…" : "Record payment"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const style = {
    PENDING: "bg-amber-50 text-amber-800",
    IN_PROGRESS: "bg-sky-50 text-sky-800",
    COMPLETED: "bg-emerald-50 text-emerald-800",
    CANCELLED: "bg-slate-100 text-slate-600",
  }[status];
  const label = {
    PENDING: "Pending",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  }[status];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>{label}</span>;
}

function MoneyDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{formatMoney(value)}</p>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{message}</div>;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      Loading…
    </div>
  );
}
