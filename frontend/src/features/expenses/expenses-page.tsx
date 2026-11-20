import { useMemo, useState, type ReactNode } from "react";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileClock,
  Plus,
  ReceiptText,
  Search,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { getRoleHomePath } from "@/features/auth/protected-route";
import {
  formatDate,
  formatMoney,
  localDateInputValue,
} from "@/features/workers/utils";

import {
  cancelExpense,
  createExpense,
  downloadExpenseReceipt,
  fetchDailyExpenseReport,
  fetchExpenseCategories,
  fetchExpenseHistory,
  fetchExpenses,
  fetchMonthlyExpenseReport,
  updateExpense,
} from "./api";
import {
  ExpenseCancelDialog,
  ExpenseDialog,
  ExpenseHistoryDialog,
} from "./expense-dialogs";
import type {
  Expense,
  ExpensePaymentMethod,
  ExpenseWritePayload,
} from "./types";

type CancellationFilter = "all" | "false" | "true";
type MutationValues = { expenseId?: string; payload: ExpenseWritePayload };
const pageSize = 15;

const paymentMethodLabels: Record<ExpensePaymentMethod, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile money",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
};

export function ExpensesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = localDateInputValue();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<ExpensePaymentMethod | "">("");
  const [cancellationFilter, setCancellationFilter] =
    useState<CancellationFilter>("false");
  const [summaryDate, setSummaryDate] = useState(today);
  const [summaryMonth, setSummaryMonth] = useState(today.slice(0, 7));
  const [expenseEditor, setExpenseEditor] = useState<
    Expense | null | undefined
  >(undefined);
  const [expenseToCancel, setExpenseToCancel] = useState<Expense | null>(null);
  const [historyExpense, setHistoryExpense] = useState<Expense | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const canManage = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const params = useMemo(() => {
    const values: Record<string, string | number> = {
      page,
      page_size: pageSize,
      ordering: "-expense_date",
    };
    if (search.trim()) values.search = search.trim();
    if (startDate) values.expense_date__gte = startDate;
    if (endDate) values.expense_date__lte = endDate;
    if (categoryFilter) values.category = categoryFilter;
    if (paymentFilter) values.payment_method = paymentFilter;
    if (cancellationFilter !== "all") {
      values.is_cancelled = cancellationFilter;
    }
    return values;
  }, [
    cancellationFilter,
    categoryFilter,
    endDate,
    page,
    paymentFilter,
    search,
    startDate,
  ]);

  const expenseQuery = useQuery({
    queryKey: ["expenses", params],
    queryFn: () => fetchExpenses(params),
  });
  const categoriesQuery = useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchExpenseCategories,
  });
  const dailyQuery = useQuery({
    queryKey: ["expense-daily-report", summaryDate],
    queryFn: () => fetchDailyExpenseReport(summaryDate),
  });
  const monthlyQuery = useQuery({
    queryKey: ["expense-monthly-report", summaryMonth],
    queryFn: () => fetchMonthlyExpenseReport(summaryMonth),
  });
  const historyQuery = useQuery({
    queryKey: ["expense-history", historyExpense?.id],
    queryFn: () => fetchExpenseHistory(historyExpense!.id),
    enabled: historyExpense !== null,
  });

  const saveMutation = useMutation({
    mutationFn: ({ expenseId, payload }: MutationValues) =>
      expenseId ? updateExpense(expenseId, payload) : createExpense(payload),
    onSuccess: async (_expense, values) => {
      await invalidateExpenseQueries(queryClient);
      setExpenseEditor(undefined);
      setNotice(values.expenseId ? "Expense updated." : "Expense recorded.");
    },
  });
  const cancelMutation = useMutation({
    mutationFn: ({ expenseId, reason }: { expenseId: string; reason: string }) =>
      cancelExpense(expenseId, reason),
    onSuccess: async () => {
      await invalidateExpenseQueries(queryClient);
      setExpenseToCancel(null);
      setNotice("Expense cancelled and removed from active totals.");
    },
  });
  const downloadMutation = useMutation({
    mutationFn: async (expense: Expense) => ({
      blob: await downloadExpenseReceipt(expense.id),
      filename: expense.receipt_name ?? "expense-receipt",
    }),
    onSuccess: ({ blob, filename }) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setDownloadError(null);
    },
    onError: (error) => setDownloadError(getExpenseErrorMessage(error)),
  });

  if (!user) {
    return null;
  }

  const list = expenseQuery.data;
  const monthly = monthlyQuery.data;
  const daily = dailyQuery.data;
  const listError = expenseQuery.error
    ? getExpenseErrorMessage(expenseQuery.error)
    : null;

  return (
    <div className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-5">
            <BrandMark compact />
            <div className="hidden border-l border-[#e6ece6] pl-5 sm:block">
              <p className="text-sm font-semibold text-foreground">Expenses</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Financial records
              </p>
            </div>
          </div>
          <Button asChild className="rounded-xl" size="sm" variant="outline">
            <Link to={getRoleHomePath(user.role)}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Workspace</span>
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-7 lg:px-9">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">
              Expense management
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#17261d] sm:text-3xl">
              Expense ledger
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Record and review daily expenses. Corrections and cancellations
              are retained in the audit history.
            </p>
          </div>
          <Button
            className="w-full rounded-xl sm:w-auto"
            onClick={() => setExpenseEditor(null)}
          >
            <Plus aria-hidden="true" className="size-4" />
            Record expense
          </Button>
        </section>

        {notice && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            {notice}
            <button
              aria-label="Dismiss notification"
              className="rounded-md p-1 hover:bg-emerald-100"
              onClick={() => setNotice(null)}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
        {downloadError && <ErrorBanner message={downloadError} />}

        <section className="grid gap-4 xl:grid-cols-2">
          <SummaryCard
            title="Daily summary"
            date={summaryDate}
            onDateChange={setSummaryDate}
            total={daily?.total_amount}
            count={daily?.expense_count}
            cancelledCount={daily?.cancelled_count}
            isLoading={dailyQuery.isLoading}
            error={
              dailyQuery.error
                ? getExpenseErrorMessage(dailyQuery.error)
                : null
            }
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            onClearDate={() => setSummaryDate(today)}
          />
          <SummaryCard
            title="Monthly summary"
            date={summaryMonth}
            onDateChange={setSummaryMonth}
            total={monthly?.total_amount}
            count={monthly?.expense_count}
            cancelledCount={monthly?.cancelled_count}
            isLoading={monthlyQuery.isLoading}
            error={
              monthlyQuery.error
                ? getExpenseErrorMessage(monthlyQuery.error)
                : null
            }
            icon={<CircleDollarSign aria-hidden="true" className="size-5" />}
            isMonth
            onClearDate={() => setSummaryMonth(today.slice(0, 7))}
          />
        </section>

        {monthly && (
          <section className="grid gap-4 lg:grid-cols-2">
            <ReportBreakdown
              title="Monthly expenses by category"
              rows={monthly.by_category.map((row) => ({
                label: row.category_name ?? "Uncategorized",
                count: row.count,
                amount: row.total_amount,
              }))}
            />
            <ReportBreakdown
              title="Monthly expenses by payment method"
              rows={monthly.by_payment_method.map((row) => ({
                label: paymentMethodLabels[row.payment_method ?? "CASH"],
                count: row.count,
                amount: row.total_amount,
              }))}
            />
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-[#e4ebe4] bg-white shadow-sm">
          <div className="border-b border-[#edf1ed] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Expense records</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Search, filter, inspect audit history, or download receipts.
                </p>
              </div>
              <div className="relative w-full lg:max-w-sm">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="rounded-xl pl-9"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search descriptions or categories"
                  value={search}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <FilterField label="From">
                <Input
                  aria-label="Filter from date"
                  className="rounded-xl"
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={startDate}
                />
              </FilterField>
              <FilterField label="To">
                <Input
                  aria-label="Filter to date"
                  className="rounded-xl"
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={endDate}
                />
              </FilterField>
              <FilterField label="Category">
                <select
                  aria-label="Filter by category"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  onChange={(event) => {
                    setCategoryFilter(event.target.value);
                    setPage(1);
                  }}
                  value={categoryFilter}
                >
                  <option value="">All categories</option>
                  {categoriesQuery.data?.results.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Payment method">
                <select
                  aria-label="Filter by payment method"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  onChange={(event) => {
                    setPaymentFilter(
                      event.target.value as ExpensePaymentMethod | "",
                    );
                    setPage(1);
                  }}
                  value={paymentFilter}
                >
                  <option value="">All methods</option>
                  {Object.entries(paymentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Record status">
                <select
                  aria-label="Filter by cancellation status"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  onChange={(event) => {
                    setCancellationFilter(
                      event.target.value as CancellationFilter,
                    );
                    setPage(1);
                  }}
                  value={cancellationFilter}
                >
                  <option value="false">Active expenses</option>
                  <option value="true">Cancelled expenses</option>
                  <option value="all">All records</option>
                </select>
              </FilterField>
            </div>
          </div>

          {listError ? (
            <div className="p-5">
              <ErrorBanner message={listError} />
            </div>
          ) : expenseQuery.isLoading ? (
            <div
              className="p-10 text-center text-sm text-muted-foreground"
              role="status"
            >
              Loading expense records…
            </div>
          ) : !list?.results.length ? (
            <div className="p-10 text-center">
              <ReceiptText
                aria-hidden="true"
                className="mx-auto size-9 text-primary/70"
              />
              <h3 className="mt-3 font-semibold">No expenses found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Adjust your filters or record an expense to get started.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-[#f7f9f7] text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date / category</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Payment</th>
                      <th className="px-4 py-3 font-medium">Recorded by</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ed]">
                    {list.results.map((expense) => (
                      <tr key={expense.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium">{formatDate(expense.expense_date)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {expense.category_name}
                          </p>
                        </td>
                        <td className="max-w-[280px] px-4 py-4">
                          <p className="truncate" title={expense.description}>
                            {expense.description}
                          </p>
                          {expense.has_receipt && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              Receipt: {expense.receipt_name}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {paymentMethodLabels[expense.payment_method]}
                        </td>
                        <td className="px-4 py-4">
                          {expense.recorded_by_name ?? "Former user"}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold tabular-nums">
                          {formatMoney(expense.amount)}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              expense.cancelled_at
                                ? "bg-red-50 text-red-700"
                                : "bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {expense.cancelled_at ? "Cancelled" : "Active"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-1">
                            {expense.has_receipt && (
                              <Button
                                aria-label={`Download receipt for ${expense.description}`}
                                disabled={downloadMutation.isPending}
                                onClick={() => downloadMutation.mutate(expense)}
                                size="icon"
                                title="Download receipt"
                                variant="ghost"
                              >
                                <Download aria-hidden="true" className="size-4" />
                              </Button>
                            )}
                            <Button
                              aria-label={`View history for ${expense.description}`}
                              onClick={() => setHistoryExpense(expense)}
                              size="icon"
                              title="Audit history"
                              variant="ghost"
                            >
                              <FileClock aria-hidden="true" className="size-4" />
                            </Button>
                            {canManage && !expense.cancelled_at && (
                              <>
                                <Button
                                  aria-label={`Edit ${expense.description}`}
                                  onClick={() => setExpenseEditor(expense)}
                                  size="sm"
                                  variant="outline"
                                >
                                  Edit
                                </Button>
                                <Button
                                  aria-label={`Cancel ${expense.description}`}
                                  onClick={() => setExpenseToCancel(expense)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                count={list.count}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </>
          )}
        </section>
      </main>

      {expenseEditor !== undefined && (
        <ExpenseDialog
          key={expenseEditor?.id ?? "new-expense"}
          categories={categoriesQuery.data?.results ?? []}
          error={
            categoriesQuery.error
              ? getExpenseErrorMessage(categoriesQuery.error)
              : saveMutation.error
                ? getExpenseErrorMessage(saveMutation.error)
                : null
          }
          expense={expenseEditor}
          isSaving={saveMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setExpenseEditor(undefined);
              saveMutation.reset();
            }
          }}
          onSubmit={(payload) =>
            saveMutation.mutate({
              expenseId: expenseEditor?.id,
              payload,
            })
          }
          open
        />
      )}
      <ExpenseCancelDialog
        key={expenseToCancel?.id ?? "cancel-expense"}
        error={
          cancelMutation.error
            ? getExpenseErrorMessage(cancelMutation.error)
            : null
        }
        expense={expenseToCancel}
        isSaving={cancelMutation.isPending}
        onConfirm={(reason) => {
          if (expenseToCancel) {
            cancelMutation.mutate({ expenseId: expenseToCancel.id, reason });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setExpenseToCancel(null);
            cancelMutation.reset();
          }
        }}
        open={expenseToCancel !== null}
      />
      <ExpenseHistoryDialog
        error={
          historyQuery.error
            ? getExpenseErrorMessage(historyQuery.error)
            : null
        }
        expense={historyExpense}
        history={historyQuery.data ?? []}
        isLoading={historyQuery.isLoading}
        onOpenChange={(open) => {
          if (!open) setHistoryExpense(null);
        }}
        open={historyExpense !== null}
      />
    </div>
  );
}

function SummaryCard({
  title,
  date,
  onDateChange,
  total,
  count,
  cancelledCount,
  isLoading,
  error,
  icon,
  isMonth = false,
  onClearDate,
}: {
  title: string;
  date: string;
  onDateChange: (value: string) => void;
  total?: string;
  count?: number;
  cancelledCount?: number;
  isLoading: boolean;
  error: string | null;
  icon: ReactNode;
  isMonth?: boolean;
  onClearDate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#edf5ef] text-primary">
            {icon}
          </span>
          <div>
            <h2 className="font-semibold">{title}</h2>
            {count !== undefined && (
              <p className="text-xs text-muted-foreground">
                {count} active · {cancelledCount ?? 0} cancelled
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            aria-label={`${title} date`}
            className="w-36 rounded-lg"
            onChange={(event) => onDateChange(event.target.value)}
            type={isMonth ? "month" : "date"}
            value={date}
          />
          <Button
            aria-label={`Reset ${title.toLowerCase()} date`}
            onClick={onClearDate}
            size="icon"
            title="Reset date"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-5">
        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading summary…
          </p>
        ) : (
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatMoney(total ?? "0.00")}
          </p>
        )}
      </div>
    </div>
  );
}

function ReportBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number; amount: string }>;
}) {
  return (
    <section className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-[#edf1ed]">
          {rows.map((row) => (
            <li
              className="flex items-center justify-between gap-3 py-3 text-sm"
              key={row.label}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.label}</span>
                <span className="text-xs text-muted-foreground">
                  {row.count} expense{row.count === 1 ? "" : "s"}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatMoney(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No active expenses in this period.
        </p>
      )}
    </section>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Pagination({
  page,
  count,
  pageSize: size,
  onPageChange,
}: {
  page: number;
  count: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(count / size));
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#edf1ed] px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {count} expense{count === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-2">
        <Button
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="icon"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <span className="min-w-16 text-center text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="icon"
          variant="outline"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      {message}
    </div>
  );
}

async function invalidateExpenseQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["expenses"] }),
    queryClient.invalidateQueries({ queryKey: ["expense-daily-report"] }),
    queryClient.invalidateQueries({ queryKey: ["expense-monthly-report"] }),
    queryClient.invalidateQueries({ queryKey: ["expense-history"] }),
  ]);
}

function getExpenseErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const errors = Object.values(data as Record<string, unknown>)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string => typeof value === "string");
      if (errors.length) return [...new Set(errors)].join(" ");
    }
    if (!error.response) {
      return "Could not reach the server. Check your connection and try again.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
