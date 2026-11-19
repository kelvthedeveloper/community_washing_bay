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
