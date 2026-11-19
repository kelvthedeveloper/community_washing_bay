import { useState } from "react";
import {
  ArrowLeft,
  Ban,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LoaderCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  UserRound,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { getRoleHomePath } from "@/features/auth/protected-route";

import {
  cancelWorkerJob,
  completeWorkerJob,
  createWorkerCommissionPayment,
  createWorkerJob,
  deactivateWorker,
  fetchWorker,
  fetchWorkerCommissionPayments,
  fetchWorkerCommissionSummary,
  fetchWorkerJobHistory,
  updateWorker,
} from "./api";
import { WorkerFormDialog } from "./worker-form-dialog";
import { WorkerJobDialog } from "./worker-job-dialog";
import { WorkerPaymentDialog } from "./worker-payment-dialog";
import type {
  CommissionPayment,
  WorkerJob,
  WorkerWritePayload,
} from "./types";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  getWorkerApiErrorMessage,
  localDateInputValue,
} from "./utils";

const pageSize = 10;

export function WorkerDetailPage() {
  const { workerId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reportDate, setReportDate] = useState(localDateInputValue());
  const [jobPage, setJobPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"jobs" | "payments">("jobs");
  const [isEditing, setIsEditing] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isAssigningJob, setIsAssigningJob] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const workerQuery = useQuery({
    queryKey: ["worker", workerId],
    queryFn: () => fetchWorker(workerId ?? ""),
    enabled: Boolean(workerId),
  });
  const jobHistoryQuery = useQuery({
    queryKey: ["worker-jobs", workerId, jobPage],
    queryFn: () => fetchWorkerJobHistory(workerId ?? "", jobPage, pageSize),
    enabled: Boolean(workerId),
  });
  const summaryQuery = useQuery({
    queryKey: ["worker-commission-summary", workerId, reportDate],
    queryFn: () => fetchWorkerCommissionSummary(workerId ?? "", reportDate),
    enabled: Boolean(workerId),
  });
  const paymentsQuery = useQuery({
    queryKey: ["worker-commission-payments", workerId, paymentPage],
    queryFn: () =>
      fetchWorkerCommissionPayments(workerId ?? "", paymentPage, pageSize),
    enabled: Boolean(workerId),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: WorkerWritePayload) =>
      updateWorker(workerId ?? "", payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["worker", workerId] }),
        queryClient.invalidateQueries({ queryKey: ["workers"] }),
      ]);
      setIsEditing(false);
      setNotice("Worker details updated.");
    },
  });
  const deactivateMutation = useMutation({
    mutationFn: () => deactivateWorker(workerId ?? ""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workers"] });
      navigate("/workspace/workers", { replace: true });
    },
  });
  const paymentMutation = useMutation({
    mutationFn: (payload: { amount: string; payment_date: string; notes: string }) =>
      createWorkerCommissionPayment(workerId ?? "", payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["worker-commission-summary", workerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["worker-commission-payments", workerId],
        }),
      ]);
      setIsRecordingPayment(false);
      setNotice("Commission payment recorded.");
    },
  });
  const assignJobMutation = useMutation({
    mutationFn: (values: { vehicle_type: string; service: string }) =>
      createWorkerJob(workerId ?? "", values.vehicle_type, values.service),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["worker-jobs", workerId],
      });
      setJobPage(1);
      setIsAssigningJob(false);
      setNotice("Job assigned to worker.");
    },
  });
  const jobActionMutation = useMutation({
    mutationFn: (values: { jobId: string; action: "complete" | "cancel" }) =>
      values.action === "complete"
        ? completeWorkerJob(values.jobId)
        : cancelWorkerJob(values.jobId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["worker-jobs", workerId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["worker-commission-summary", workerId],
        }),
      ]);
      setNotice(
        variables.action === "complete"
          ? "Job completed and commission accrued."
          : "Job cancelled.",
      );
    },
  });

  if (!workerId) {
    return <Navigate replace to="/workspace/workers" />;
  }
  if (!user) {
    return null;
  }
  if (workerQuery.isPending) {
    return <LoadingPage />;
  }
  if (workerQuery.isError) {
    return (
      <ErrorPage
        message={getWorkerApiErrorMessage(workerQuery.error)}
        onRetry={() => void workerQuery.refetch()}
      />
    );
  }

  const worker = workerQuery.data;
  const canRecordPayment =
    user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const outstanding = summaryQuery.data?.outstanding_commission ?? "0.00";

  return (
    <div className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-9">
          <div className="flex items-center gap-5">
            <BrandMark compact />
            <div className="hidden border-l border-[#e6ece6] pl-5 sm:block">
              <p className="text-sm font-semibold text-foreground">
                Worker management
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                People and commission history
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
          to="/workspace/workers"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All workers
        </Link>

        {notice && (
          <div
            className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{notice}</span>
            <button
              aria-label="Dismiss notification"
              className="ml-auto text-emerald-800 underline-offset-4 hover:underline"
              onClick={() => setNotice(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        )}

        <section className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#edf5ef] text-primary">
                <UserRound aria-hidden="true" className="size-6" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-2xl font-semibold tracking-tight text-[#17261d] sm:text-3xl">
                    {worker.full_name}
                  </h1>
                  <StatusBadge isActive={worker.is_active} />
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  Worker ID: {worker.id}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {worker.is_active && (
                <Button
                  className="rounded-xl"
                  onClick={() => {
                    assignJobMutation.reset();
                    setIsAssigningJob(true);
                  }}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Assign job
                </Button>
              )}
              <Button
                className="rounded-xl"
                onClick={() => {
                  saveMutation.reset();
                  setIsEditing(true);
                }}
                type="button"
                variant="outline"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit worker
              </Button>
              {worker.is_active && (
                <Button
                  className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    deactivateMutation.reset();
                    setIsDeactivating(true);
                  }}
                  type="button"
                  variant="outline"
                >
                  <Ban aria-hidden="true" className="size-4" />
                  Deactivate
                </Button>
              )}
            </div>
          </div>

          <dl className="mt-6 grid gap-4 border-t border-[#edf1ed] pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <DetailInfo
              icon={Phone}
              label="Phone number"
              value={worker.phone_number}
            />
            <DetailInfo
              icon={BriefcaseBusiness}
              label="Employment date"
              value={formatDate(worker.employment_date)}
            />
            <DetailInfo
              icon={MapPin}
              label="Address"
              value={worker.address || "Not provided"}
            />
            <DetailInfo
              icon={CalendarDays}
              label="Record created"
              value={formatDateTime(worker.created_at)}
            />
          </dl>
          {worker.notes && (
            <div className="mt-5 rounded-xl bg-[#f7f9f7] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {worker.notes}
              </p>
            </div>
          )}
        </section>

        <section aria-label="Commission overview" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Daily commission
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-[#17261d]">
                  {summaryQuery.isPending
                    ? "—"
                    : formatMoney(summaryQuery.data?.daily_commission ?? "0.00")}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="sr-only">Commission date</span>
                <CalendarDays aria-hidden="true" className="size-4" />
                <Input
                  aria-label="Commission date"
                  className="h-10 w-40 rounded-xl"
                  onChange={(event) => setReportDate(event.target.value)}
                  type="date"
                  value={reportDate}
                />
              </label>
            </div>
            {summaryQuery.isError && (
              <InlineError
                message={getWorkerApiErrorMessage(summaryQuery.error)}
              />
            )}
          </div>
          <div className="rounded-2xl border border-[#dbe9de] bg-[#edf5ef] p-5">
            <p className="text-sm font-medium text-primary">
              Outstanding commission
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#17261d]">
              {summaryQuery.isPending ? "—" : formatMoney(outstanding)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Completed job commission less recorded payments.
            </p>
            {canRecordPayment && Number(outstanding) > 0 && (
              <Button
                className="mt-4 rounded-xl"
                onClick={() => {
                  paymentMutation.reset();
                  setIsRecordingPayment(true);
                }}
                type="button"
              >
                <CreditCard aria-hidden="true" className="size-4" />
                Record payment
              </Button>
            )}
            {summaryQuery.isError && (
              <InlineError
                message={getWorkerApiErrorMessage(summaryQuery.error)}
              />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e4ebe4] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ed] px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Worker history
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Jobs, accrued commissions, and payments
              </p>
            </div>
            <div
              aria-label="Worker history views"
              className="inline-flex rounded-xl bg-[#f3f6f3] p-1"
              role="tablist"
            >
              <HistoryTab
                active={activeTab === "jobs"}
                onClick={() => setActiveTab("jobs")}
              >
                Job history
              </HistoryTab>
              <HistoryTab
                active={activeTab === "payments"}
                onClick={() => setActiveTab("payments")}
              >
                Payments
              </HistoryTab>
            </div>
          </div>
          {activeTab === "jobs" ? (
            <JobHistory
              data={jobHistoryQuery.data}
              error={
                jobHistoryQuery.isError
                  ? getWorkerApiErrorMessage(jobHistoryQuery.error)
                  : null
              }
              actionError={
                jobActionMutation.isError
                  ? getWorkerApiErrorMessage(jobActionMutation.error)
                  : null
              }
              canManageJobs
              isLoading={jobHistoryQuery.isPending}
              onCancel={(job) =>
                jobActionMutation.mutate({ jobId: job.id, action: "cancel" })
              }
              onComplete={(job) =>
                jobActionMutation.mutate({ jobId: job.id, action: "complete" })
              }
              onNext={() => setJobPage((current) => current + 1)}
              onPrevious={() => setJobPage((current) => Math.max(current - 1, 1))}
              pendingJobId={
                jobActionMutation.isPending
                  ? jobActionMutation.variables?.jobId
                  : null
              }
            />
          ) : (
            <PaymentHistory
              data={paymentsQuery.data}
              error={
                paymentsQuery.isError
                  ? getWorkerApiErrorMessage(paymentsQuery.error)
                  : null
              }
              isLoading={paymentsQuery.isPending}
              onNext={() => setPaymentPage((current) => current + 1)}
              onPrevious={() =>
                setPaymentPage((current) => Math.max(current - 1, 1))
              }
            />
          )}
        </section>
      </main>

      {isEditing && (
        <WorkerFormDialog
          error={
            saveMutation.isError
              ? getWorkerApiErrorMessage(saveMutation.error)
              : null
          }
          isSaving={saveMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setIsEditing(false);
              saveMutation.reset();
            }
          }}
          onSubmit={(payload) => saveMutation.mutate(payload)}
          open
          worker={worker}
        />
      )}

      {isAssigningJob && (
        <WorkerJobDialog
          error={
            assignJobMutation.isError
              ? getWorkerApiErrorMessage(assignJobMutation.error)
              : null
          }
          isSaving={assignJobMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setIsAssigningJob(false);
              assignJobMutation.reset();
            }
          }}
          onSubmit={(values) => assignJobMutation.mutate(values)}
          open
          workerName={worker.full_name}
        />
      )}

      {isDeactivating && (
        <Dialog
          description="This worker remains visible in historical records and cannot be assigned to new jobs."
          onOpenChange={(open) => {
            if (!open) {
              setIsDeactivating(false);
              deactivateMutation.reset();
            }
          }}
          open
          title={`Deactivate ${worker.full_name}?`}
        >
          <div className="space-y-5">
            {deactivateMutation.isError && (
              <InlineError
                message={getWorkerApiErrorMessage(deactivateMutation.error)}
              />
            )}
            <div className="flex justify-end gap-3 border-t border-[#edf1ed] pt-4">
              <Button
                className="rounded-xl"
                disabled={deactivateMutation.isPending}
                onClick={() => setIsDeactivating(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate()}
                type="button"
                variant="destructive"
              >
                {deactivateMutation.isPending
                  ? "Deactivating…"
                  : "Deactivate worker"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {isRecordingPayment && (
        <WorkerPaymentDialog
          error={
            paymentMutation.isError
              ? getWorkerApiErrorMessage(paymentMutation.error)
              : null
          }
          isSaving={paymentMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setIsRecordingPayment(false);
              paymentMutation.reset();
            }
          }}
          onSubmit={(payload) => paymentMutation.mutate(payload)}
          open
          outstanding={outstanding}
        />
      )}
    </div>
  );
}

function DetailInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function HistoryTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      aria-selected={active}
      className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

function JobHistory({
  data,
  error,
  actionError,
  isLoading,
  canManageJobs,
  pendingJobId,
  onPrevious,
  onNext,
  onComplete,
  onCancel,
}: {
  data: { count: number; next: string | null; previous: string | null; results: WorkerJob[] } | undefined;
  error: string | null;
  actionError: string | null;
  isLoading: boolean;
  canManageJobs: boolean;
  pendingJobId: string | null | undefined;
  onPrevious: () => void;
  onNext: () => void;
  onComplete: (job: WorkerJob) => void;
  onCancel: (job: WorkerJob) => void;
}) {
  if (isLoading) {
    return <HistoryLoading />;
  }
  if (error) {
    return <HistoryError message={error} />;
  }
  if (!data || data.results.length === 0) {
    return (
      <HistoryEmpty>
        No jobs are recorded for this worker yet.
      </HistoryEmpty>
    );
  }

  return (
    <>
      {actionError && (
        <div className="px-4 pt-4 sm:px-6">
          <InlineError message={actionError} />
        </div>
      )}
      <div className="divide-y divide-[#edf1ed]">
        {data.results.map((job) => (
          <article
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            key={job.id}
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {job.service_name} · {job.vehicle_type_name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {job.completed_at
                  ? `Completed ${formatDateTime(job.completed_at)}`
                  : `Assigned ${formatDateTime(job.assigned_at)}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <JobStatus status={job.status} />
              <ValuePair label="Job price" value={formatMoney(job.service_price)} />
              <ValuePair
                label="Commission"
                value={formatMoney(job.commission_amount)}
              />
              {canManageJobs && job.status === "ASSIGNED" && (
                <div className="flex gap-2">
                  <Button
                    className="rounded-lg"
                    disabled={Boolean(pendingJobId)}
                    onClick={() => onComplete(job)}
                    size="sm"
                    type="button"
                  >
                    {pendingJobId === job.id ? "Saving…" : "Complete"}
                  </Button>
                  <Button
                    className="rounded-lg"
                    disabled={Boolean(pendingJobId)}
                    onClick={() => onCancel(job)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel job
                  </Button>
                </div>
              )}
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

function PaymentHistory({
  data,
  error,
  isLoading,
  onPrevious,
  onNext,
}: {
  data:
    | {
        count: number;
        next: string | null;
        previous: string | null;
        results: CommissionPayment[];
      }
    | undefined;
  error: string | null;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (isLoading) {
    return <HistoryLoading />;
  }
  if (error) {
    return <HistoryError message={error} />;
  }
  if (!data || data.results.length === 0) {
    return (
      <HistoryEmpty>
        No commission payments have been recorded for this worker.
      </HistoryEmpty>
    );
  }

  return (
    <>
      <div className="divide-y divide-[#edf1ed]">
        {data.results.map((payment) => (
          <article
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            key={payment.id}
          >
            <div>
              <p className="font-medium text-foreground">
                {formatMoney(payment.amount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Paid {formatDate(payment.payment_date)}
                {payment.recorded_by_name
                  ? ` · Recorded by ${payment.recorded_by_name}`
                  : ""}
              </p>
            </div>
            <p className="max-w-xl whitespace-pre-wrap text-sm text-muted-foreground">
              {payment.notes || "—"}
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

function JobStatus({ status }: { status: WorkerJob["status"] }) {
  const label =
    status === "COMPLETED"
      ? "Completed"
      : status === "CANCELLED"
        ? "Cancelled"
        : "Assigned";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        status === "COMPLETED"
          ? "bg-emerald-50 text-emerald-800"
          : status === "CANCELLED"
            ? "bg-slate-100 text-slate-600"
            : "bg-amber-50 text-amber-800"
      }`}
    >
      {label}
    </span>
  );
}

function ValuePair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Pagination({
  count,
  next,
  previous,
  onPrevious,
  onNext,
}: {
  count: number;
  next: string | null;
  previous: string | null;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (count <= pageSize) {
    return null;
  }
  return (
    <div className="flex items-center justify-between border-t border-[#edf1ed] px-4 py-3 sm:px-6">
      <p className="text-xs text-muted-foreground">
        {count} {count === 1 ? "record" : "records"}
      </p>
      <div className="flex gap-2">
        <Button
          aria-label="Previous page"
          className="size-9 rounded-lg"
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
          className="size-9 rounded-lg"
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

function HistoryLoading() {
  return (
    <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground" role="status">
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      Loading history…
    </div>
  );
}

function HistoryError({ message }: { message: string }) {
  return (
    <div className="px-5 py-8 sm:px-6" role="alert">
      <InlineError message={message} />
    </div>
  );
}

function HistoryEmpty({ children }: { children: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">
      {children}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      {message}
    </p>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        isActive
          ? "bg-emerald-50 text-emerald-800"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          isActive ? "bg-emerald-600" : "bg-slate-400"
        }`}
      />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function LoadingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f8f5] text-sm text-muted-foreground" role="status">
      <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />
      Loading worker…
    </div>
  );
}

function ErrorPage({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f5f8f5] px-5 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        Worker could not be loaded
      </h1>
      <p className="max-w-lg text-sm leading-6 text-muted-foreground">{message}</p>
      <div className="flex gap-3">
        <Button className="rounded-xl" onClick={onRetry} variant="outline">
          Try again
        </Button>
        <Button asChild className="rounded-xl">
          <Link to="/workspace/workers">Back to workers</Link>
        </Button>
      </div>
    </main>
  );
}
