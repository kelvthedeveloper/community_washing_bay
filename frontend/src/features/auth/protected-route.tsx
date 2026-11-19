import type { ReactNode } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { Link, Navigate, useLocation, type Location } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { useAuth } from "./auth-context";
import type { BusinessRole } from "./types";

const roleHomePaths: Record<BusinessRole, string> = {
  SUPER_ADMIN: "/workspace/super-admin",
  ADMIN: "/workspace/admin",
  MANAGER: "/workspace/manager",
};

export function getRoleHomePath(role: BusinessRole) {
  return roleHomePaths[role];
}

function AuthenticationLoading() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-6"
      role="status"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        Verifying your access…
      </div>
    </main>
  );
}

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: BusinessRole[];
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AuthenticationLoading />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (
    allowedRoles &&
    user.role !== "SUPER_ADMIN" &&
    !allowedRoles.includes(user.role)
  ) {
    return <AccessDenied userRole={user.role} />;
  }

  return children;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AuthenticationLoading />;
  }
  if (user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  return children;
}

export function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <AuthenticationLoading />;
  }
  return <Navigate to={user ? getRoleHomePath(user.role) : "/login"} replace />;
}

function AccessDenied({ userRole }: { userRole: BusinessRole }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert aria-hidden="true" className="size-6" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Access restricted
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          This area is not available to your role
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your {userRole.replace("_", " ").toLowerCase()} account does not have
          permission to open this page.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to={getRoleHomePath(userRole)}>Return to your workspace</Link>
        </Button>
      </section>
    </main>
  );
}

export type LoginLocationState = {
  from?: Location;
  notice?: string;
};
