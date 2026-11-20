import { useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-context";
import { getRoleHomePath } from "./protected-route";
import type { BusinessRole } from "./types";
import {
  fetchActiveJobs,
  fetchDailyExpenses,
  fetchDailyWorkerAssignments,
  fetchLowStockProducts,
  fetchManagedAccounts,
  fetchOwnerDashboardReport,
  fetchRecentActivity,
  fetchRecentExpenses,
  fetchRecentJobs,
} from "./dashboard-api";
import { fetchValuationReport } from "@/features/inventory/api";
import { formatDate, formatDateTime, formatMoney, getWorkerApiErrorMessage, localDateInputValue } from "@/features/workers/utils";
import type { OwnerReport } from "@/features/reporting/types";
import type { Job } from "@/features/jobs/types";
import type { Expense } from "@/features/expenses/types";
import type { DashboardActivity } from "./dashboard-api";

const roleDetails: Record<BusinessRole, { label: string; description: string; heading: string }> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    description: "System-wide access",
    heading: "System overview",
  },
  ADMIN: {
    label: "Admin · Owner",
    description: "Business owner access",
    heading: "Owner dashboard",
  },
  MANAGER: {
    label: "Manager",
    description: "Daily operations access",
    heading: "Operations dashboard",
  },
};

const today = localDateInputValue();
const defaultMonthStart = `${today.slice(0, 7)}-01`;

type DashboardLink = {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: BusinessRole[];
};

const dashboardLinks: DashboardLink[] = [
  { title: "Dashboard", href: "home", icon: LayoutDashboard },
  { title: "POS & washing jobs", href: "/workspace/pos", icon: CarFront },
  { title: "Workers", href: "/workspace/workers", icon: UserRound },
  { title: "Inventory", href: "/workspace/inventory", icon: Boxes },
  { title: "Expenses", href: "/workspace/expenses", icon: ReceiptText },
  { title: "Business settings", href: "/workspace/settings/vehicle-types", icon: Settings2 },
  { title: "Owner reports", href: "/workspace/reports", icon: ChartNoAxesCombined, roles: ["ADMIN", "SUPER_ADMIN"] },
  { title: "User management", href: "/workspace/users", icon: Users, roles: ["ADMIN", "SUPER_ADMIN"] },
];

export function WorkspacePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [startDate, setStartDate] = useState(defaultMonthStart);
  const [endDate, setEndDate] = useState(today);

  const isManager = user?.role === "MANAGER";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const invalidDateRange = !startDate || !endDate || startDate > endDate;
  const managerDayQuery = useQuery({
    queryKey: ["dashboard-manager-day", selectedDate],
    queryFn: () => fetchDailyWorkerAssignments(selectedDate),
    enabled: Boolean(user && isManager),
  });
  const activeJobsQuery = useQuery({
    queryKey: ["dashboard-active-jobs"],
    queryFn: fetchActiveJobs,
    enabled: Boolean(user && isManager),
    refetchInterval: 30_000,
  });
  const dailyExpensesQuery = useQuery({
    queryKey: ["dashboard-daily-expenses", selectedDate],
    queryFn: () => fetchDailyExpenses(selectedDate),
    enabled: Boolean(user && isManager),
  });
  const recentDailyExpensesQuery = useQuery({
    queryKey: ["dashboard-recent-daily-expenses", selectedDate],
    queryFn: () => fetchRecentExpenses(6, selectedDate),
    enabled: Boolean(user && isManager),
  });
  const reportQuery = useQuery({
    queryKey: ["dashboard-owner-report", startDate, endDate],
    queryFn: () => fetchOwnerDashboardReport(startDate, endDate),
    enabled: Boolean(user && !isManager && !invalidDateRange),
  });
  const valuationQuery = useQuery({
    queryKey: ["dashboard-inventory-valuation", endDate],
    queryFn: () => fetchValuationReport(endDate),
    enabled: Boolean(user && !isManager && !invalidDateRange),
  });
  const lowStockQuery = useQuery({
    queryKey: ["dashboard-low-stock"],
    queryFn: fetchLowStockProducts,
    enabled: Boolean(user),
  });
  const recentJobsQuery = useQuery({
    queryKey: ["dashboard-recent-jobs"],
    queryFn: () => fetchRecentJobs(6),
    enabled: Boolean(user && !isManager),
  });
  const recentExpensesQuery = useQuery({
    queryKey: ["dashboard-recent-expenses"],
    queryFn: () => fetchRecentExpenses(6),
    enabled: Boolean(user && !isManager),
  });
  const activityQuery = useQuery({
    queryKey: ["dashboard-recent-activity"],
    queryFn: fetchRecentActivity,
    enabled: Boolean(user && isSuperAdmin),
  });
  const accountCountQuery = useQuery({
    queryKey: ["dashboard-account-count"],
    queryFn: () => fetchManagedAccounts({ page: 1, page_size: 1 }),
    enabled: Boolean(user && isSuperAdmin),
  });

  if (!user) {
    return null;
  }

  const role = roleDetails[user.role];
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;
  const currentPath = getRoleHomePath(user.role);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      navigate("/login", {
        replace: true,
        state: {
          notice:
            "You have been signed out here, but the server could not confirm token revocation. Sign in again when ready.",
        },
      });
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f8f5] text-[#17261d] lg:grid lg:grid-cols-[258px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen min-h-0 flex-col overflow-y-auto bg-[#123a2a] px-4 py-5 text-white lg:flex">
        <div className="rounded-xl bg-white px-3 py-3">
          <BrandMark compact />
        </div>
        <div className="mt-7 px-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Workspace</p>
          <p className="mt-1 truncate text-sm font-medium">{displayName}</p>
          <p className="mt-0.5 text-xs text-emerald-100/70">{role.label}</p>
        </div>
        <DashboardNavigation
          links={dashboardLinks}
          homePath={currentPath}
          pathname={location.pathname}
          role={user.role}
          onNavigate={() => setMobileMenuOpen(false)}
        />
        <div className="mt-auto border-t border-white/10 pt-4">
          <Button
            className="w-full justify-start rounded-xl text-emerald-50 hover:bg-white/10 hover:text-white"
            disabled={isLoggingOut}
            onClick={() => void handleLogout()}
            variant="ghost"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-[#e6ece6] bg-white/95 backdrop-blur">
          <div className="flex min-h-[72px] items-center justify-between gap-3 px-4 sm:px-7 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
                className="lg:hidden"
                onClick={() => setMobileMenuOpen((open) => !open)}
                size="icon"
                variant="ghost"
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
              <div className="lg:hidden"><BrandMark compact /></div>
              <div className="hidden lg:block">
                <p className="text-sm font-semibold">{role.heading}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#edf5ef] text-primary">
                <UserRound aria-hidden="true" className="size-4" />
              </span>
              <Button
                aria-label="Sign out"
                className="lg:hidden"
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
                size="icon"
                variant="ghost"
              >
                <LogOut aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
          {mobileMenuOpen && (
            <div className="border-t border-[#e6ece6] bg-[#123a2a] px-4 pb-4 text-white lg:hidden">
              <DashboardNavigation
                links={dashboardLinks}
                homePath={currentPath}
                pathname={location.pathname}
                role={user.role}
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <Button
                className="mt-2 w-full justify-start rounded-xl text-emerald-50 hover:bg-white/10 hover:text-white"
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
                variant="ghost"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </Button>
            </div>
          )}
        </header>

        <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">{role.description}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{role.heading}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Welcome back, {displayName}. Here is the latest from your business.
              </p>
            </div>
            <DashboardDateFilter
              isManager={isManager}
              selectedDate={selectedDate}
              startDate={startDate}
              endDate={endDate}
              onSelectedDate={setSelectedDate}
              onStartDate={setStartDate}
              onEndDate={setEndDate}
            />
          </div>

          {isManager ? (
            <ManagerDashboard
              date={selectedDate}
              jobsData={managerDayQuery.data}
              jobsLoading={managerDayQuery.isPending}
              jobsError={managerDayQuery.error}
              activeJobsCount={activeJobsQuery.data?.count}
              activeJobs={activeJobsQuery.data?.results ?? []}
              activeJobsLoading={activeJobsQuery.isPending}
              activeJobsError={activeJobsQuery.error}
              expenses={dailyExpensesQuery.data}
              expensesLoading={dailyExpensesQuery.isPending}
              expensesError={dailyExpensesQuery.error}
              recentExpenses={recentDailyExpensesQuery.data?.results ?? []}
              recentExpensesLoading={recentDailyExpensesQuery.isPending}
              recentExpensesError={recentDailyExpensesQuery.error}
              lowStock={lowStockQuery.data?.results ?? []}
              lowStockCount={lowStockQuery.data?.count ?? 0}
              lowStockLoading={lowStockQuery.isPending}
              lowStockError={lowStockQuery.error}
            />
          ) : invalidDateRange ? (
            <InlineNotice>
              {startDate && endDate
                ? "Start date must be on or before end date."
                : "Choose a valid date range."}
            </InlineNotice>
          ) : (
            <OwnerDashboard
              report={reportQuery.data}
              reportLoading={reportQuery.isPending}
              reportError={reportQuery.error}
              valuation={valuationQuery.data}
              valuationLoading={valuationQuery.isPending}
              valuationError={valuationQuery.error}
              recentJobs={recentJobsQuery.data?.results ?? []}
              recentJobsLoading={recentJobsQuery.isPending}
              recentJobsError={recentJobsQuery.error}
              recentExpenses={recentExpensesQuery.data?.results ?? []}
              recentExpensesLoading={recentExpensesQuery.isPending}
              recentExpensesError={recentExpensesQuery.error}
              superAdmin={isSuperAdmin}
              accountCount={accountCountQuery.data?.count}
              accountCountLoading={accountCountQuery.isPending}
              accountCountError={accountCountQuery.error}
              accounts={accountCountQuery.data?.results ?? []}
              activity={activityQuery.data ?? []}
              activityLoading={activityQuery.isPending}
              activityError={activityQuery.error}
              lowStock={lowStockQuery.data?.results ?? []}
              lowStockCount={lowStockQuery.data?.count ?? 0}
              lowStockLoading={lowStockQuery.isPending}
              lowStockError={lowStockQuery.error}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardNavigation({
  links,
  homePath,
  pathname,
  role,
  onNavigate,
}: {
  links: DashboardLink[];
  homePath: string;
  pathname: string;
  role: BusinessRole;
  onNavigate: () => void;
}) {
  const visibleLinks = links.filter((item) => !item.roles || item.roles.includes(role));
  return (
    <nav aria-label="Main navigation" className="mt-5 space-y-1">
      {visibleLinks.map(({ title, href, icon: Icon }) => {
        const path = href === "home" ? homePath : href;
        const active = pathname === path || (href.includes("/settings/") && pathname.startsWith("/workspace/settings/"));
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-white text-[#123a2a]" : "text-emerald-50/90 hover:bg-white/10 hover:text-white"
            }`}
            key={title}
            onClick={onNavigate}
            to={path}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{title}</span>
            {active && <ChevronRight aria-hidden="true" className="ml-auto size-4" />}
          </Link>
        );
      })}
    </nav>
  );
}

function DashboardDateFilter({
  isManager,
  selectedDate,
  startDate,
  endDate,
  onSelectedDate,
  onStartDate,
  onEndDate,
}: {
  isManager: boolean;
  selectedDate: string;
  startDate: string;
  endDate: string;
  onSelectedDate: (value: string) => void;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
}) {
  if (isManager) {
    return (
      <label className="flex items-center gap-3 self-start rounded-xl border border-[#e2e9e2] bg-white px-3 py-2 text-sm sm:self-auto">
        <CalendarDays aria-hidden="true" className="size-4 text-primary" />
        <span className="font-medium">Operations date</span>
        <input
          aria-label="Operations date"
          className="min-w-0 rounded-lg border border-[#e2e9e2] px-2 py-1 text-sm"
          max={today}
          onChange={(event) => {
            if (event.target.value) {
              onSelectedDate(event.target.value);
            }
          }}
          required
          type="date"
          value={selectedDate}
        />
      </label>
    );
  }
  return (
    <div className="grid gap-3 rounded-xl border border-[#e2e9e2] bg-white p-3 sm:grid-cols-2 xl:flex xl:items-center">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        From
        <input
          aria-label="Report start date"
          className="min-w-0 rounded-lg border border-[#e2e9e2] px-2 py-1.5 text-sm text-foreground"
          max={endDate || today}
          onChange={(event) => onStartDate(event.target.value)}
          required
          type="date"
          value={startDate}
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        To
        <input
          aria-label="Report end date"
          className="min-w-0 rounded-lg border border-[#e2e9e2] px-2 py-1.5 text-sm text-foreground"
          max={today}
          min={startDate}
          onChange={(event) => onEndDate(event.target.value)}
          required
          type="date"
          value={endDate}
        />
      </label>
    </div>
  );
}

function OwnerDashboard({
  report,
  reportLoading,
  reportError,
  valuation,
  valuationLoading,
  valuationError,
  recentJobs,
  recentJobsLoading,
  recentJobsError,
  recentExpenses,
  recentExpensesLoading,
  recentExpensesError,
  superAdmin,
  accountCount,
  accountCountLoading,
  accountCountError,
  accounts,
  activity,
  activityLoading,
  activityError,
  lowStock,
  lowStockCount,
  lowStockLoading,
  lowStockError,
}: {
  report: OwnerReport | undefined;
  reportLoading: boolean;
  reportError: unknown;
  valuation: { total_stock_value: string; low_stock_count: number } | undefined;
  valuationLoading: boolean;
  valuationError: unknown;
  recentJobs: Job[];
  recentJobsLoading: boolean;
  recentJobsError: unknown;
  recentExpenses: Expense[];
  recentExpensesLoading: boolean;
  recentExpensesError: unknown;
  superAdmin: boolean;
  accountCount: number | undefined;
  accountCountLoading: boolean;
  accountCountError: unknown;
  accounts: Array<{ id: string; username: string; role: BusinessRole; is_active: boolean; date_joined: string }>;
  activity: DashboardActivity[];
  activityLoading: boolean;
  activityError: unknown;
  lowStock: Array<{ id: string; name: string; stock_on_hand: string; unit_label: string; low_stock_threshold: string }>;
  lowStockCount: number;
  lowStockLoading: boolean;
  lowStockError: unknown;
}) {
  const summary = report?.opening_summary;
  const reportErrorMessage = reportError ? getWorkerApiErrorMessage(reportError) : null;
  const metrics = [
    { label: "Net revenue", value: summary?.net_revenue, detail: "Completed sales, less sales returns", icon: CircleDollarSign },
    { label: "Total expenses", value: summary?.expenses, detail: "Active expenses in selected range", icon: ReceiptText },
    { label: "Estimated profit", value: summary?.net_operating_result, detail: "Net operating result", icon: ChartNoAxesCombined, highlight: true },
    { label: "Worker commissions", value: summary?.net_commission_cost, detail: "Earned plus ledger adjustments", icon: Users },
    { label: "Inventory valuation", value: valuation?.total_stock_value, detail: "Stock value at report end date", icon: Boxes, loading: valuationLoading, error: valuationError },
    { label: "Outstanding payments", value: summary?.outstanding_payments, detail: "Receivables as of end date", icon: Banknote },
  ];

  return (
    <div className="space-y-6">
      {reportErrorMessage && <InlineNotice>{reportErrorMessage}</InlineNotice>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <SummaryCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            icon={metric.icon}
            loading={metric.loading ?? reportLoading}
            error={metric.error ? getWorkerApiErrorMessage(metric.error) : reportErrorMessage}
            highlight={metric.highlight}
          />
        ))}
        {superAdmin && (
          <SummaryCard
            label="Login accounts"
            value={accountCount === undefined ? undefined : String(accountCount)}
            detail="Accounts visible to Super Admin"
            icon={ShieldCheck}
            loading={accountCountLoading}
            error={accountCountError ? getWorkerApiErrorMessage(accountCountError) : null}
            money={false}
            href="/workspace/users"
          />
        )}
      </section>

      {report && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CompactMetric label="Cash collected" value={report.revenue_breakdown.net_cash_collected} detail="Payments less refunds in range" />
          <CompactMetric label="Completed jobs" value={String(report.completed_jobs)} detail={`${report.total_vehicles_serviced} vehicles serviced`} money={false} />
          <CompactMetric label="Commission payouts" value={report.commissions.payouts} detail="Cash disbursed to workers" />
          <CompactMetric label="Inventory usage cost" value={report.inventory.usage_cost} detail="Cost of stock consumed" />
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Panel
          title="Monthly performance"
          description="Completed sales and sales returns by day in the selected date range."
          loading={reportLoading}
          error={reportErrorMessage}
        >
          {report ? <SalesChart report={report} /> : null}
        </Panel>
        {superAdmin ? (
          <Panel
            title="Recent activity"
            description="Latest recorded jobs, expenses, inventory movements, and account registrations."
            loading={activityLoading}
            error={activityError ? getWorkerApiErrorMessage(activityError) : null}
          >
            <ActivityList
              activity={[
                ...activity,
                ...accounts.map((account) => ({
                  id: `account-${account.id}`,
                  kind: "account" as const,
                  label: "User account registered",
                  detail: `${account.username} · ${account.role.replace("_", " ")}${account.is_active ? "" : " · inactive"}`,
                  actor: null,
                  occurredAt: account.date_joined,
                  amount: null,
                })),
              ]
                .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
                .slice(0, 10)}
            />
          </Panel>
        ) : (
          <Panel
            title="Recent transactions"
            description="Recent washing sales and recorded expenses."
            loading={recentJobsLoading || recentExpensesLoading}
            error={
              recentJobsError
                ? getWorkerApiErrorMessage(recentJobsError)
                : recentExpensesError
                  ? getWorkerApiErrorMessage(recentExpensesError)
                  : null
            }
          >
            <RecentTransactions jobs={recentJobs} expenses={recentExpenses} />
          </Panel>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Recent washing jobs"
          description="Latest registered vehicles and assigned washers."
          loading={recentJobsLoading}
          error={recentJobsError ? getWorkerApiErrorMessage(recentJobsError) : null}
        >
          <RecentJobList jobs={recentJobs} />
        </Panel>
        <Panel
          title="Stock alerts"
          description={`${lowStockCount} products at or below their configured threshold.`}
          loading={lowStockLoading}
          error={lowStockError ? getWorkerApiErrorMessage(lowStockError) : null}
        >
          <LowStockList products={lowStock.slice(0, 6)} />
        </Panel>
      </div>

      {Boolean(valuationError) && (
        <InlineNotice>Inventory valuation unavailable: {getWorkerApiErrorMessage(valuationError)}</InlineNotice>
      )}
    </div>
  );
}

function ManagerDashboard({
  date,
  jobsData,
  jobsLoading,
  jobsError,
  activeJobsCount,
  activeJobs,
  activeJobsLoading,
  activeJobsError,
  expenses,
  expensesLoading,
  expensesError,
  recentExpenses,
  recentExpensesLoading,
  recentExpensesError,
  lowStock,
  lowStockCount,
  lowStockLoading,
  lowStockError,
}: {
  date: string;
  jobsData: Awaited<ReturnType<typeof fetchDailyWorkerAssignments>> | undefined;
  jobsLoading: boolean;
  jobsError: unknown;
  activeJobsCount: number | undefined;
  activeJobs: Job[];
  activeJobsLoading: boolean;
  activeJobsError: unknown;
  expenses: { total_amount: string; expense_count: number; cancelled_count: number } | undefined;
  expensesLoading: boolean;
  expensesError: unknown;
  recentExpenses: Expense[];
  recentExpensesLoading: boolean;
  recentExpensesError: unknown;
  lowStock: Array<{ id: string; name: string; stock_on_hand: string; unit_label: string; low_stock_threshold: string }>;
  lowStockCount: number;
  lowStockLoading: boolean;
  lowStockError: unknown;
}) {
  const dayJobs = jobsData?.jobs ?? [];
  const completedJobs = dayJobs.filter((job) => job.status === "COMPLETED");
  const inProgressJobs = dayJobs.filter((job) => job.status === "IN_PROGRESS");
  const sales = sumMoney(completedJobs.map((job) => job.total_price));
  const uniqueVehicles = new Set(dayJobs.map((job) => job.vehicle_number_plate || job.number_plate).filter(Boolean)).size;
  const cards = [
    { label: "Vehicles serviced", value: jobsLoading ? undefined : String(uniqueVehicles), detail: "Unique plates on selected date", icon: CarFront, money: false },
    { label: "Active washing jobs", value: activeJobsCount === undefined ? undefined : String(activeJobsCount), detail: "Currently in progress", icon: BriefcaseBusiness, loading: activeJobsLoading, error: activeJobsError, money: false },
    { label: "Completed jobs", value: jobsLoading ? undefined : String(completedJobs.length), detail: "For the selected date", icon: ClipboardList, money: false },
    { label: "Daily sales", value: jobsLoading ? undefined : sales, detail: "Completed job value for selected date", icon: CircleDollarSign, money: true },
    { label: "Daily expenses", value: expenses?.total_amount, detail: `${expenses?.expense_count ?? 0} active expense records`, icon: ReceiptText, loading: expensesLoading, error: expensesError },
    { label: "Stock alerts", value: lowStockLoading ? undefined : String(lowStockCount), detail: "Products at/below threshold", icon: AlertTriangle, loading: lowStockLoading, error: lowStockError, money: false },
  ];

  return (
    <div className="space-y-6">
      {Boolean(jobsError) && <InlineNotice>{getWorkerApiErrorMessage(jobsError)}</InlineNotice>}
      {Boolean(activeJobsError) && <InlineNotice>Active jobs unavailable: {getWorkerApiErrorMessage(activeJobsError)}</InlineNotice>}
      {Boolean(expensesError) && <InlineNotice>Daily expenses unavailable: {getWorkerApiErrorMessage(expensesError)}</InlineNotice>}
      {Boolean(lowStockError) && <InlineNotice>Stock alerts unavailable: {getWorkerApiErrorMessage(lowStockError)}</InlineNotice>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <SummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            icon={card.icon}
            loading={card.loading ?? jobsLoading}
            error={card.error ? getWorkerApiErrorMessage(card.error) : undefined}
            money={card.money}
          />
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <Panel title="Today's job activity" description={`Job status distribution · ${formatDate(date)}`} loading={jobsLoading}>
          <JobStatusChart jobs={dayJobs} />
        </Panel>
        <Panel
          title="Stock alerts"
          description={`${lowStockCount} items need attention.`}
          loading={lowStockLoading}
          error={lowStockError ? getWorkerApiErrorMessage(lowStockError) : null}
        >
          <LowStockList products={lowStock.slice(0, 5)} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Worker assignments" description="Washers assigned to jobs for the selected date." loading={jobsLoading}>
          <WorkerAssignments jobs={dayJobs} activeWorkerCount={jobsData?.workerCount ?? 0} activeJobCount={inProgressJobs.length} />
        </Panel>
        <Panel
          title="Active washing jobs"
          description="Jobs currently in progress across the bay."
          loading={activeJobsLoading}
          error={activeJobsError ? getWorkerApiErrorMessage(activeJobsError) : null}
        >
          <RecentJobList jobs={activeJobs.slice(0, 8)} empty="No jobs are currently in progress." />
        </Panel>
      </div>
      <Panel
        title="Recent transactions"
        description={`Completed sales and expense records for ${formatDate(date)}.`}
        loading={jobsLoading || recentExpensesLoading}
        error={
          jobsError
            ? getWorkerApiErrorMessage(jobsError)
            : recentExpensesError
            ? getWorkerApiErrorMessage(recentExpensesError)
            : null
        }
      >
        <RecentTransactions jobs={dayJobs} expenses={recentExpenses} />
      </Panel>
      {expenses && (
        <p className="text-xs text-muted-foreground">
          Daily expense summary for {formatDate(date)} excludes {expenses.cancelled_count} cancelled record(s).
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  loading = false,
  error,
  highlight = false,
  money = true,
  href,
}: {
  label: string;
  value: string | undefined;
  detail: string;
  icon: typeof LayoutDashboard;
  loading?: boolean;
  error?: string | null;
  highlight?: boolean;
  money?: boolean;
  href?: string;
}) {
  const content = (
    <div className={`rounded-2xl border p-5 shadow-sm transition-colors ${highlight ? "border-[#b9d8c2] bg-[#eaf4ed]" : "border-[#e4ebe4] bg-white"} ${href ? "hover:border-primary/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[#17261d]">
            {loading ? <LoaderCircle aria-label="Loading" className="size-6 animate-spin text-primary" /> : error ? "—" : value === undefined ? "—" : money ? formatMoney(value) : value}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#edf5ef] text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs leading-5 text-muted-foreground">{error ?? detail}</p>
        {href && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-primary" />}
      </div>
    </div>
  );
  return href ? <Link className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" to={href}>{content}</Link> : content;
}

function CompactMetric({ label, value, detail, money = true }: { label: string; value: string; detail: string; money?: boolean }) {
  return (
    <div className="rounded-xl border border-[#e4ebe4] bg-white px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{money ? formatMoney(value) : value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
  loading = false,
  error,
}: {
  title: string;
  description: string;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {error ? (
        <InlineNotice>{error}</InlineNotice>
      ) : loading ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />Loading dashboard data…
        </div>
      ) : children}
    </section>
  );
}

function SalesChart({ report }: { report: OwnerReport }) {
  if (report.sales_by_period.length === 0) {
    return <EmptyState message="No completed sales or refunds in this date range." />;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={report.sales_by_period} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#278451" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#278451" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#edf1ed" strokeDasharray="4 4" vertical={false} />
          <XAxis axisLine={false} dataKey="period_start" tick={{ fill: "#64746a", fontSize: 11 }} tickLine={false} tickFormatter={(value: string) => value.slice(5)} />
          <YAxis axisLine={false} tick={{ fill: "#64746a", fontSize: 11 }} tickLine={false} tickFormatter={(value: number) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)} width={42} />
          <Tooltip formatter={(value) => formatMoney(String(value))} labelFormatter={(value) => `Period from ${String(value)}`} />
          <Area dataKey="sales" fill="url(#salesFill)" name="Completed sales" stroke="#278451" strokeWidth={2.5} type="monotone" />
          <Area dataKey="refunds" fill="transparent" name="Refunds" stroke="#cf6d55" strokeDasharray="5 4" strokeWidth={2} type="monotone" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function JobStatusChart({ jobs }: { jobs: Job[] }) {
  const data = [
    { label: "Pending", jobs: jobs.filter((job) => job.status === "PENDING").length },
    { label: "In progress", jobs: jobs.filter((job) => job.status === "IN_PROGRESS").length },
    { label: "Completed", jobs: jobs.filter((job) => job.status === "COMPLETED").length },
    { label: "Cancelled", jobs: jobs.filter((job) => job.status === "CANCELLED").length },
  ];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#edf1ed" strokeDasharray="4 4" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tick={{ fill: "#64746a", fontSize: 11 }} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#64746a", fontSize: 11 }} tickLine={false} />
          <Tooltip />
          <Bar dataKey="jobs" fill="#278451" name="Jobs" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecentJobList({ jobs, empty = "No washing jobs recorded yet." }: { jobs: Job[]; empty?: string }) {
  if (jobs.length === 0) {
    return <EmptyState message={empty} />;
  }
  return (
    <ul className="divide-y divide-[#edf1ed]">
      {jobs.map((job) => (
        <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={job.id}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#edf5ef] text-primary">
              <CarFront aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{job.number_plate || "Legacy vehicle"} · {job.vehicle_type_name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {job.assigned_workers.map((worker) => worker.worker_name).join(", ") || "No washer assigned"} · {formatDateTime(job.registered_at)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{formatMoney(job.total_price)}</p>
            <p className="text-[10px] text-muted-foreground">{job.status === "COMPLETED" ? "Sale value" : "Quoted value"}</p>
            <JobStatus status={job.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecentTransactions({ jobs, expenses }: { jobs: Job[]; expenses: Expense[] }) {
  const rows = [
    ...jobs.filter((job) => job.status === "COMPLETED").map((job) => ({
      id: `sale-${job.id}`,
      label: "Completed sale",
      description: `${job.number_plate || "Vehicle"} · booked value`,
      amount: job.total_price,
      date: job.registered_at,
      positive: true,
    })),
    ...expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      label: expense.cancelled_at ? "Expense reversal" : "Expense",
      description: `${expense.category_name} · ${expense.description || "No description"}`,
      amount: expense.cancelled_at ? null : expense.amount,
      date: expense.updated_at,
      positive: false,
    })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 8);
  if (rows.length === 0) {
    return <EmptyState message="No recent transaction records." />;
  }
  return (
    <ul className="divide-y divide-[#edf1ed]">
      {rows.map((row) => (
        <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={row.id}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${row.positive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {row.positive ? <ArrowUpRight aria-hidden="true" className="size-4" /> : <ArrowDownRight aria-hidden="true" className="size-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.label}</p>
              <p className="truncate text-xs text-muted-foreground">{row.description} · {formatDateTime(row.date)}</p>
            </div>
          </div>
          {row.amount !== null && (
            <p className={`shrink-0 text-sm font-semibold ${row.positive ? "text-emerald-800" : "text-foreground"}`}>
              {row.positive ? "" : "−"}{formatMoney(row.amount)}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActivityList({ activity }: { activity: DashboardActivity[] }) {
  if (activity.length === 0) {
    return <EmptyState message="No recent recorded operations." />;
  }
  return (
    <ul className="divide-y divide-[#edf1ed]">
      {activity.map((item) => (
        <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" key={item.id}>
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#edf5ef] text-primary">
            {item.kind === "job" ? <CarFront className="size-4" /> : item.kind === "expense" ? <ReceiptText className="size-4" /> : item.kind === "account" ? <Users className="size-4" /> : <Boxes className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.label}</p>
            <p className="truncate text-xs text-muted-foreground">{item.detail}{item.actor ? ` · by ${item.actor}` : ""}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(item.occurredAt)}</p>
          </div>
          {item.amount !== null && <p className="shrink-0 text-xs font-medium">{formatMoney(item.amount)}</p>}
        </li>
      ))}
    </ul>
  );
}

function WorkerAssignments({
  jobs,
  activeWorkerCount,
  activeJobCount,
}: {
  jobs: Job[];
  activeWorkerCount: number;
  activeJobCount: number;
}) {
  const workToday = jobs.filter((job) => job.status === "PENDING" || job.status === "IN_PROGRESS");
  if (workToday.length === 0) {
    return (
      <div>
        <EmptyState message="No active assignments for the selected date." />
        <p className="mt-3 text-xs text-muted-foreground">{activeWorkerCount} active workers available.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">{activeJobCount} jobs in progress · {activeWorkerCount} active workers</p>
      <ul className="divide-y divide-[#edf1ed]">
        {workToday.slice(0, 8).map((job) => (
          <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0" key={job.id}>
            <div>
              <p className="text-sm font-medium">{job.number_plate || "Legacy vehicle"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {job.assigned_workers.map((worker) => worker.worker_name).join(", ") || "Unassigned"}
              </p>
            </div>
            <JobStatus status={job.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LowStockList({
  products,
}: {
  products: Array<{ id: string; name: string; stock_on_hand: string; unit_label: string; low_stock_threshold: string }>;
}) {
  if (products.length === 0) {
    return <EmptyState message="No products are currently below their configured stock threshold." />;
  }
  return (
    <ul className="divide-y divide-[#edf1ed]">
      {products.map((product) => (
        <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={product.id}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Threshold {product.low_stock_threshold} {product.unit_label}</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {product.stock_on_hand} {product.unit_label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function JobStatus({ status }: { status: Job["status"] }) {
  const colors: Record<Job["status"], string> = {
    PENDING: "bg-slate-100 text-slate-700",
    IN_PROGRESS: "bg-blue-50 text-blue-700",
    COMPLETED: "bg-emerald-50 text-emerald-800",
    CANCELLED: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${colors[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center rounded-xl bg-[#f7f9f7] px-4 py-5 text-center">
      <Activity aria-hidden="true" className="size-5 text-muted-foreground" />
      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function InlineNotice({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{children}</div>;
}

function sumMoney(values: string[]) {
  const cents = values.reduce((sum, value) => {
    const amount = Number(value);
    return sum + (Number.isFinite(amount) ? Math.round(amount * 100) : 0);
  }, 0);
  return `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, "0")}`;
}
