import { useMemo, useState } from "react";
import {
  Ban,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  X,
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
  createWorker,
  deactivateWorker,
  fetchWorkers,
  updateWorker,
} from "./api";
import { WorkerFormDialog } from "./worker-form-dialog";
import type { Worker, WorkerWritePayload } from "./types";
import {
  formatDate,
  getWorkerApiErrorMessage,
} from "./utils";

type ActiveFilter = "all" | "true" | "false";
type DialogMode = "create" | "edit" | null;
const pageSize = 10;

export function WorkerListPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [workerToDeactivate, setWorkerToDeactivate] = useState<Worker | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const params = useMemo(() => {
    const query: Record<string, string | number> = {
      page,
      page_size: pageSize,
    };
    if (search.trim()) {
      query.search = search.trim();
    }
    if (activeFilter !== "all") {
      query.is_active = activeFilter;
    }
    return query;
  }, [activeFilter, page, search]);

  const workersQuery = useQuery({
    queryKey: ["workers", params],
    queryFn: () => fetchWorkers(params),
  });
  const saveMutation = useMutation({
    mutationFn: (payload: WorkerWritePayload) =>
      selectedWorker
        ? updateWorker(selectedWorker.id, payload)
        : createWorker(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workers"] });
      setDialogMode(null);
      setSelectedWorker(null);
      setNotice(
        `Worker ${selectedWorker ? "updated" : "registered"} successfully.`,
      );
    },
  });
  const deactivateMutation = useMutation({
    mutationFn: (worker: Worker) => deactivateWorker(worker.id),
    onSuccess: async (_data, worker) => {
      await queryClient.invalidateQueries({ queryKey: ["workers"] });
      setWorkerToDeactivate(null);
      setNotice(`${worker.full_name} was deactivated.`);
    },
  });

  if (!user) {
    return null;
  }

  const workers = workersQuery.data?.results ?? [];
  const hasFilters = Boolean(search.trim()) || activeFilter !== "all";

  function openCreateDialog() {
    saveMutation.reset();
    setSelectedWorker(null);
    setDialogMode("create");
  }

  function openEditDialog(worker: Worker) {
    saveMutation.reset();
    setSelectedWorker(worker);
    setDialogMode("edit");
  }

  function closeFormDialog(open: boolean) {
    if (!open) {
      setDialogMode(null);
      setSelectedWorker(null);
      saveMutation.reset();
    }
  }

  function clearFilters() {
    setSearch("");
    setActiveFilter("all");
    setPage(1);
  }

  const totalPages = Math.max(
    1,
    Math.ceil((workersQuery.data?.count ?? 0) / pageSize),
  );

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-primary">
              Community Washing Bay
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#17261d] sm:text-3xl">
              Workers
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Register and manage worker records. Workers are not application
              login accounts.
            </p>
          </div>
          <Button className="shrink-0 rounded-xl" onClick={openCreateDialog}>
            <Plus aria-hidden="true" className="size-4" />
            Register worker
          </Button>
        </div>

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

        <section
          aria-label="Worker filters"
          className="rounded-2xl border border-[#e4ebe4] bg-white p-3 shadow-sm sm:p-4"
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
            <label className="relative block">
              <span className="sr-only">Search workers</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="h-11 rounded-xl pl-9"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name or phone"
                type="search"
                value={search}
              />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                className={filterSelectClass}
                onChange={(event) => {
                  setActiveFilter(event.target.value as ActiveFilter);
                  setPage(1);
                }}
                value={activeFilter}
              >
                <option value="all">All workers</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            {hasFilters && (
              <Button
                className="h-11 rounded-xl"
                onClick={clearFilters}
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
                Clear
              </Button>
            )}
          </div>
        </section>

        {workersQuery.isPending ? (
          <LoadingState />
        ) : workersQuery.isError ? (
          <ErrorState
            message={getWorkerApiErrorMessage(workersQuery.error)}
            onRetry={() => void workersQuery.refetch()}
          />
        ) : (
          <>
            <div className="flex min-h-6 items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                {workersQuery.data.count}{" "}
                {workersQuery.data.count === 1 ? "worker" : "workers"}
              </p>
              {workersQuery.isFetching && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                  role="status"
                >
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                  Updating…
                </span>
              )}
            </div>
            {workers.length === 0 ? (
              <EmptyState
                hasFilters={hasFilters}
                onCreate={openCreateDialog}
              />
            ) : (
              <WorkerList
                onDeactivate={(worker) => {
                  deactivateMutation.reset();
                  setWorkerToDeactivate(worker);
                }}
                onEdit={openEditDialog}
                workers={workers}
              />
            )}
            {workersQuery.data.count > pageSize && (
              <div className="flex items-center justify-between rounded-xl border border-[#e4ebe4] bg-white px-3 py-2.5">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    aria-label="Previous page"
                    className="size-9 rounded-lg"
                    disabled={!workersQuery.data.previous}
                    onClick={() => setPage((current) => Math.max(current - 1, 1))}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    aria-label="Next page"
                    className="size-9 rounded-lg"
                    disabled={!workersQuery.data.next}
                    onClick={() => setPage((current) => current + 1)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {dialogMode && (
        <WorkerFormDialog
          error={
            saveMutation.isError
              ? getWorkerApiErrorMessage(saveMutation.error)
              : null
          }
          isSaving={saveMutation.isPending}
          onOpenChange={closeFormDialog}
          onSubmit={(payload) => saveMutation.mutate(payload)}
          open
          worker={dialogMode === "edit" ? selectedWorker : null}
        />
      )}

      {workerToDeactivate && (
        <Dialog
          description="This worker remains visible in historical records and cannot be assigned to new jobs."
          onOpenChange={(open) => {
            if (!open) {
              setWorkerToDeactivate(null);
              deactivateMutation.reset();
            }
          }}
          open
          title={`Deactivate ${workerToDeactivate.full_name}?`}
        >
          <div className="space-y-5">
            {deactivateMutation.isError && (
              <FormError message={getWorkerApiErrorMessage(deactivateMutation.error)} />
            )}
            <p className="rounded-xl bg-[#f6f8f6] p-4 text-sm leading-6 text-muted-foreground">
              Deactivating a worker does not remove their job or commission
              history.
            </p>
            <div className="flex flex-col-reverse gap-3 border-t border-[#edf1ed] pt-4 sm:flex-row sm:justify-end">
              <Button
                className="rounded-xl"
                disabled={deactivateMutation.isPending}
                onClick={() => setWorkerToDeactivate(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(workerToDeactivate)}
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
    </div>
  );
}

function WorkerList({
  workers,
  onEdit,
  onDeactivate,
}: {
  workers: Worker[];
  onEdit: (worker: Worker) => void;
  onDeactivate: (worker: Worker) => void;
}) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {workers.map((worker) => (
          <article
            className="rounded-2xl border border-[#e4ebe4] bg-white p-4 shadow-sm"
            key={worker.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  className="break-words text-sm font-semibold text-foreground hover:text-primary"
                  to={`/workspace/workers/${worker.id}`}
                >
                  {worker.full_name}
                </Link>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  {worker.id}
                </p>
              </div>
              <StatusBadge isActive={worker.is_active} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#edf1ed] pt-3">
              <WorkerInfo icon={Phone} label="Phone" value={worker.phone_number} />
              <WorkerInfo
                icon={BriefcaseBusiness}
                label="Employed"
                value={formatDate(worker.employment_date)}
              />
            </div>
            <WorkerActions
              onDeactivate={() => onDeactivate(worker)}
              onEdit={() => onEdit(worker)}
              worker={worker}
            />
          </article>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-2xl border border-[#e4ebe4] bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="bg-[#f7f9f7]">
              <tr>
                {["Worker", "Phone", "Employment date", "Status", "Actions"].map(
                  (label) => (
                    <th
                      className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      key={label}
                      scope="col"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ed]">
              {workers.map((worker) => (
                <tr className="transition-colors hover:bg-[#fbfcfb]" key={worker.id}>
                  <td className="px-5 py-4">
                    <Link
                      className="font-medium text-foreground hover:text-primary"
                      to={`/workspace/workers/${worker.id}`}
                    >
                      {worker.full_name}
                    </Link>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {worker.id}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground">
                    {worker.phone_number}
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground">
                    {formatDate(worker.employment_date)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge isActive={worker.is_active} />
                  </td>
                  <td className="px-5 py-4">
                    <WorkerActions
                      onDeactivate={() => onDeactivate(worker)}
                      onEdit={() => onEdit(worker)}
                      worker={worker}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function WorkerActions({
  worker,
  onEdit,
  onDeactivate,
}: {
  worker: Worker;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[#edf1ed] pt-3">
      <Button
        asChild
        className="rounded-lg"
        size="sm"
        variant="outline"
      >
        <Link to={`/workspace/workers/${worker.id}`}>
          <UserRound aria-hidden="true" className="size-3.5" />
          Details
        </Link>
      </Button>
      <Button
        aria-label={`Edit ${worker.full_name}`}
        className="rounded-lg"
        onClick={onEdit}
        size="sm"
        type="button"
        variant="outline"
      >
        <Pencil aria-hidden="true" className="size-3.5" />
        Edit
      </Button>
      {worker.is_active && (
        <Button
          aria-label={`Deactivate ${worker.full_name}`}
          className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDeactivate}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Ban aria-hidden="true" className="size-3.5" />
          Deactivate
        </Button>
      )}
    </div>
  );
}

function WorkerInfo({
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
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-medium text-foreground">
        {value}
      </dd>
    </div>
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

function LoadingState() {
  return (
    <div className="space-y-3" role="status">
      <div className="flex items-center gap-2 rounded-2xl border border-[#e4ebe4] bg-white px-5 py-5 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading workers…
      </div>
      {[0, 1, 2].map((row) => (
        <div
          aria-hidden="true"
          className="h-20 animate-pulse rounded-2xl border border-[#e4ebe4] bg-white"
          key={row}
        />
      ))}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white px-6 py-10 text-center" role="alert">
      <h2 className="text-base font-semibold text-foreground">
        Workers could not be loaded
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {message}
      </p>
      <Button className="mt-5 rounded-xl" onClick={onRetry} variant="outline">
        Try again
      </Button>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onCreate,
}: {
  hasFilters: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[#d6e0d7] bg-white px-6 py-14 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#edf5ef] text-primary">
        <UserRound aria-hidden="true" className="size-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        {hasFilters ? "No matching workers" : "No workers registered yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {hasFilters
          ? "Change the search or status filter to find workers."
          : "Register a worker to start keeping job and commission history."}
      </p>
      {!hasFilters && (
        <Button className="mt-5 rounded-xl" onClick={onCreate}>
          <Plus aria-hidden="true" className="size-4" />
          Register worker
        </Button>
      )}
    </section>
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

const filterSelectClass =
  "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
