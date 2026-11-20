import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/features/auth/auth-context";
import {
  HomeRoute,
  ProtectedRoute,
  PublicOnlyRoute,
} from "@/features/auth/protected-route";
import type { BusinessRole } from "@/features/auth/types";

const LoginPage = lazy(() =>
  import("@/features/auth/login-page").then((module) => ({
    default: module.LoginPage,
  })),
);
const WorkspacePage = lazy(() =>
  import("@/features/auth/workspace-page").then((module) => ({
    default: module.WorkspacePage,
  })),
);
const ConfigurationSettingsPage = lazy(() =>
  import("@/features/configuration/settings-page").then((module) => ({
    default: module.ConfigurationSettingsPage,
  })),
);
const WorkerListPage = lazy(() =>
  import("@/features/workers/worker-list-page").then((module) => ({
    default: module.WorkerListPage,
  })),
);
const WorkerDetailPage = lazy(() =>
  import("@/features/workers/worker-detail-page").then((module) => ({
    default: module.WorkerDetailPage,
  })),
);
const JobsPage = lazy(() =>
  import("@/features/jobs/jobs-page").then((module) => ({
    default: module.JobsPage,
  })),
);
const ReceiptPage = lazy(() =>
  import("@/features/jobs/receipt-page").then((module) => ({
    default: module.ReceiptPage,
  })),
);
const InventoryPage = lazy(() =>
  import("@/features/inventory/inventory-page").then((module) => ({
    default: module.InventoryPage,
  })),
);
const ExpensesPage = lazy(() =>
  import("@/features/expenses/expenses-page").then((module) => ({
    default: module.ExpensesPage,
  })),
);
const ReportingPage = lazy(() =>
  import("@/features/reporting/reporting-page").then((module) => ({
    default: module.ReportingPage,
  })),
);
const AccountsPage = lazy(() =>
  import("@/features/auth/accounts-page").then((module) => ({
    default: module.AccountsPage,
  })),
);

const roleRoutes: Array<{ path: string; role: BusinessRole }> = [
  { path: "/workspace/super-admin", role: "SUPER_ADMIN" },
  { path: "/workspace/admin", role: "ADMIN" },
  { path: "/workspace/manager", role: "MANAGER" },
];

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense
          fallback={
            <main
              className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
              role="status"
            >
              Loading secure access…
            </main>
          }
        >
          <Routes>
            <Route
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
              path="/login"
            />
            <Route
              element={
                <ProtectedRoute>
                  <ConfigurationSettingsPage />
                </ProtectedRoute>
              }
              path="/workspace/settings/:section"
            />
            <Route
              element={
                <Navigate replace to="/workspace/settings/vehicle-types" />
              }
              path="/workspace/settings"
            />
            <Route
              element={
                <ProtectedRoute>
                  <WorkerListPage />
                </ProtectedRoute>
              }
              path="/workspace/workers"
            />
            <Route
              element={
                <ProtectedRoute>
                  <WorkerDetailPage />
                </ProtectedRoute>
              }
              path="/workspace/workers/:workerId"
            />
            <Route
              element={
                <ProtectedRoute>
                  <JobsPage />
                </ProtectedRoute>
              }
              path="/workspace/pos"
            />
            <Route
              element={
                <ProtectedRoute>
                  <JobsPage />
                </ProtectedRoute>
              }
              path="/workspace/jobs"
            />
            <Route
              element={
                <ProtectedRoute>
                  <InventoryPage />
                </ProtectedRoute>
              }
              path="/workspace/inventory"
            />
            <Route
              element={
                <ProtectedRoute>
                  <ExpensesPage />
                </ProtectedRoute>
              }
              path="/workspace/expenses"
            />
            <Route
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "SUPER_ADMIN"]}>
                  <ReportingPage />
                </ProtectedRoute>
              }
              path="/workspace/reports"
            />
            <Route
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "SUPER_ADMIN"]}>
                  <AccountsPage />
                </ProtectedRoute>
              }
              path="/workspace/users"
            />
            <Route
              element={
                <ProtectedRoute>
                  <ReceiptPage />
                </ProtectedRoute>
              }
              path="/workspace/jobs/:jobId/receipt"
            />
            <Route element={<HomeRoute />} path="/" />
            {roleRoutes.map(({ path, role }) => (
              <Route
                element={
                  <ProtectedRoute allowedRoles={[role]}>
                    <WorkspacePage />
                  </ProtectedRoute>
                }
                key={path}
                path={path}
              />
            ))}
            <Route element={<HomeRoute />} path="*" />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
