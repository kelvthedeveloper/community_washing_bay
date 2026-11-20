import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { getRoleHomePath } from "@/features/auth/protected-route";
import { getWorkerApiErrorMessage, formatMoney, localDateInputValue } from "@/features/workers/utils";

import { downloadOwnerReport, fetchOwnerReport } from "./api";
import type { OwnerReport, ReportGroupBy } from "./types";

const today = localDateInputValue();
const monthStart = `${today.slice(0, 7)}-01`;

export function ReportingPage() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("daily");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);
  const dateRangeInvalid = startDate > endDate;
  const params = { start_date: startDate, end_date: endDate, group_by: groupBy };
  const reportQuery = useQuery({
    queryKey: ["owner-report", params],
    queryFn: () => fetchOwnerReport(params),
    enabled: Boolean(startDate && endDate && !dateRangeInvalid),
  });

  if (!user) {
    return null;
  }

  async function handleDownload(format: "csv" | "pdf") {
    setDownloadError(null);
    setDownloading(format);
    try {
      await downloadOwnerReport(format, params);
    } catch (error) {
      setDownloadError(getWorkerApiErrorMessage(error));
    } finally {
      setDownloading(null);
    }
  }

  const report = reportQuery.data;

  return (
    <div className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-9">
          <div className="flex items-center gap-5">
            <BrandMark compact />
            <div className="hidden border-l border-[#e6ece6] pl-5 sm:block">
              <p className="text-sm font-semibold text-foreground">Owner reports</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Financial and operating summary</p>
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

        <section className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Business performance</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#17261d] sm:text-3xl">
                Owner report
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Review completed sales, cash movement, operating costs, commissions, and receivables separately.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-xl"
                disabled={dateRangeInvalid || Boolean(downloading)}
                onClick={() => void handleDownload("csv")}
                variant="outline"
              >
                {downloading === "csv" ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Export CSV
              </Button>
              <Button
                className="rounded-xl"
                disabled={dateRangeInvalid || Boolean(downloading)}
                onClick={() => void handleDownload("pdf")}
                variant="outline"
              >
                {downloading === "pdf" ? <LoaderCircle className="size-4 animate-spin" /> : <FileText className="size-4" />}
                Export PDF
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto]">
            <label className="space-y-1.5 text-sm font-medium">
              Start date
              <Input
                className="rounded-xl"
                max={endDate || today}
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              End date
              <Input
                className="rounded-xl"
                max={today}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Sales grouping
              <select
                className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm"
                onChange={(event) => setGroupBy(event.target.value as ReportGroupBy)}
                value={groupBy}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button
                className="w-full rounded-xl lg:w-auto"
                disabled={reportQuery.isFetching || dateRangeInvalid}
                onClick={() => void reportQuery.refetch()}
                variant="outline"
              >
                <RefreshCw aria-hidden="true" className={`size-4 ${reportQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
          {dateRangeInvalid && (
            <p className="mt-3 text-sm text-red-700" role="alert">Start date must be on or before end date.</p>
          )}
          {downloadError && <p className="mt-3 text-sm text-red-700" role="alert">{downloadError}</p>}
        </section>

        {dateRangeInvalid ? (
          <div className="rounded-2xl border border-[#e4ebe4] bg-white p-8 text-center text-sm text-muted-foreground">
            Choose a valid date range to view the report.
          </div>
        ) : reportQuery.isPending ? (
          <LoadingReport />
        ) : reportQuery.isError ? (
          <ErrorReport message={getWorkerApiErrorMessage(reportQuery.error)} onRetry={() => void reportQuery.refetch()} />
        ) : report ? (
          <ReportContent report={report} />
        ) : null}
      </main>
    </div>
  );
}

function ReportContent({ report }: { report: OwnerReport }) {
  const summary = report.opening_summary;
  const revenue = report.revenue_breakdown;
  const metrics = [
    { label: "Net revenue", value: summary.net_revenue, detail: "Completed sales less returns" },
    { label: "Cash collected", value: summary.cash_collected, detail: "Payments less refunds in range" },
    { label: "Expenses", value: summary.expenses, detail: "Active expenses only" },
    { label: "Net commission cost", value: summary.net_commission_cost, detail: "Earned plus ledger adjustments" },
    { label: "Inventory purchases", value: summary.inventory_purchases, detail: "Cash outflow; not deducted twice" },
    { label: "Inventory usage cost", value: summary.inventory_usage_cost, detail: "Cost of stock consumed" },
    { label: "Outstanding payments", value: summary.outstanding_payments, detail: "Receivables as of end date" },
    { label: "Net operating result", value: summary.net_operating_result, detail: "Estimated operating result" },
  ];
  return (
    <>
      <section className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Opening summary</p>
            <h2 className="mt-1 text-lg font-semibold text-[#17261d]">
              {report.start_date} – {report.end_date}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {report.completed_jobs} completed · {report.cancelled_jobs} cancelled · {report.total_vehicles_serviced} vehicles serviced
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SmallMetric label="Gross profit estimate" value={summary.gross_profit_estimate} />
          <SmallMetric label="Commission payouts (cash outflow)" value={summary.commission_payouts} />
          <SmallMetric label="Unique vehicles serviced" value={String(report.unique_vehicles_serviced)} />
        </div>
        <p className="mt-4 rounded-xl bg-[#f5f8f5] p-3 text-xs leading-5 text-muted-foreground">
          Gross profit estimate = net revenue − net earned commission cost − inventory usage cost. Net operating result subtracts active expenses. Inventory purchases and commission payouts are reported as cash movements, not deducted a second time.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportSection title="Revenue and cash flow">
          <DataTable
            headers={["Measure", "Amount"]}
            rows={[
              ["Sales before discounts", formatMoney(revenue.sales_before_discounts)],
              ["Discounts", `−${formatMoney(revenue.discounts)}`],
              ["Completed sales", formatMoney(revenue.completed_sales)],
              ["Sales returns (completed jobs)", `−${formatMoney(revenue.sales_returns)}`],
              ["Net revenue", formatMoney(revenue.net_revenue)],
              ["Payments received", formatMoney(revenue.payments_received)],
              ["Refunds paid", `−${formatMoney(revenue.refunds_paid)}`],
              ["Net cash collected", formatMoney(revenue.net_cash_collected)],
              ["Refunds for cancelled jobs", formatMoney(revenue.canceled_job_refunds)],
            ]}
          />
        </ReportSection>
        <ReportSection title={`Sales ${report.group_by}`}>
          <DataTable
            headers={["Period start", "Sales", "Refunds", "Net revenue", "Jobs"]}
            rows={report.sales_by_period.map((row) => [
              row.period_start,
              formatMoney(row.sales),
              `−${formatMoney(row.refunds)}`,
              formatMoney(row.net_revenue),
              String(row.jobs),
            ])}
            empty="No completed sales or returns in this period."
          />
        </ReportSection>
        <ReportSection title="Sales by service">
          <DataTable
            headers={["Service", "Jobs", "Discounts", "Revenue"]}
            rows={report.sales_by_service.map((row) => [
              row.service_name,
              String(row.quantity),
              `−${formatMoney(row.discounts)}`,
              formatMoney(row.revenue),
            ])}
            empty="No completed services in this period."
          />
        </ReportSection>
        <ReportSection title="Expenses by category">
          <DataTable
            headers={["Category", "Records", "Amount"]}
            rows={report.expenses.by_category.map((row) => [
              row.category_name,
              String(row.count),
              formatMoney(row.amount),
            ])}
            empty="No active expenses in this period."
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Active: {formatMoney(report.expenses.total)} ({report.expenses.count}) · Cancelled: {formatMoney(report.expenses.cancelled_amount)} ({report.expenses.cancelled_count})
          </p>
        </ReportSection>
        <ReportSection title="Worker commissions and payouts">
          <DataTable
            headers={["Worker", "Earned", "Adjustments", "Net cost", "Payouts"]}
            rows={report.commissions.by_worker.map((row) => [
              row.worker_name,
              formatMoney(row.earned),
              formatMoney(row.adjustments),
              formatMoney(row.net_commission),
              formatMoney(row.payouts),
            ])}
            empty="No commission ledger or payout activity in this period."
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Reversals: {formatMoney(report.commissions.reversals)} · Payout records: {report.commissions.payout_count} · Payout total: {formatMoney(report.commissions.payouts)}
          </p>
        </ReportSection>
        <ReportSection title="Inventory purchases and usage">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purchases</p>
          <DataTable
            headers={["Supply", "Quantity", "Cost"]}
            rows={report.inventory.purchases_by_product.map((row) => [
              row.product_name,
              `${row.quantity} ${row.unit_label}`,
              formatMoney(row.amount),
            ])}
            empty="No purchases in this period."
          />
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usage cost</p>
          <DataTable
            headers={["Supply", "Quantity", "Cost"]}
            rows={report.inventory.usage_by_product.map((row) => [
              row.product_name,
              `${row.quantity} ${row.unit_label}`,
              formatMoney(row.amount),
            ])}
            empty="No stock usage in this period."
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Purchases: {formatMoney(report.inventory.purchases)} ({report.inventory.purchase_count}) · Usage cost: {formatMoney(report.inventory.usage_cost)} · Adjustments: {report.inventory.adjustment_count} ({formatMoney(report.inventory.adjustment_value)})
          </p>
        </ReportSection>
        <ReportSection title="Outstanding payments">
          <div className="grid gap-3 sm:grid-cols-2">
            <SmallMetric label="Outstanding as of end date" value={report.outstanding_payments.amount} />
            <SmallMetric label="Jobs with an outstanding balance" value={String(report.outstanding_payments.job_count)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Cash held for cancelled jobs: {formatMoney(report.outstanding_payments.cash_held_for_cancelled_jobs)}. Cancelled jobs are excluded from receivables; unrefunded payments remain visible separately.
          </p>
        </ReportSection>
      </div>
    </>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#e7ece7] bg-[#fbfcfb] p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-[#17261d]">{formatMoney(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f5f8f5] p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{/^-?\d+(\.\d+)?$/.test(value) ? formatMoney(value) : value}</p>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 text-base font-semibold text-[#17261d]">{title}</h2>
      {children}
    </section>
  );
}

function DataTable({
  headers,
  rows,
  empty = "No records for this period.",
}: {
  headers: string[];
  rows: string[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-xl bg-[#f7f9f7] px-3 py-5 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-[#edf1ed] text-xs font-medium text-muted-foreground">
            {headers.map((header) => <th className="px-2 py-2 first:pl-0 last:pr-0" key={header}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-b border-[#f0f3f0] last:border-0" key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td className="px-2 py-2.5 first:pl-0 last:pr-0" key={`${cellIndex}-${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingReport() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-2xl border border-[#e4ebe4] bg-white text-sm text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />
      Loading owner report…
    </div>
  );
}

function ErrorReport({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900" role="alert">
      <BarChart3 aria-hidden="true" className="mb-2 size-5" />
      <p>{message}</p>
      <Button className="mt-4 rounded-xl" onClick={onRetry} variant="outline">
        <Download aria-hidden="true" className="size-4" />
        Retry report
      </Button>
    </div>
  );
}
