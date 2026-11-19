import { useState } from "react";
import {
  ArrowRight,
  LogOut,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

import { useAuth } from "./auth-context";
import type { BusinessRole } from "./types";

const roleDetails: Record<BusinessRole, { label: string; description: string }> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    description: "System-wide access",
  },
  ADMIN: {
    label: "Admin",
    description: "Business owner access",
  },
  MANAGER: {
    label: "Manager",
    description: "Daily operations access",
  },
};

export function WorkspacePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) {
    return null;
  }

  const role = roleDetails[user.role];
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;

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
    <main className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <BrandMark compact />
          <Button
            className="rounded-xl"
            disabled={isLoggingOut}
            onClick={handleLogout}
            variant="outline"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="rounded-3xl border border-[#e4ebe4] bg-white p-7 shadow-[0_20px_60px_-40px_rgba(19,62,45,0.28)] sm:p-10">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[#edf5ef] text-primary">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
          <p className="mt-8 text-sm font-semibold text-primary">
            {role.description}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17261d] sm:text-4xl">
            You’re signed in, {displayName}.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Review or manage business configuration below. Operational
            dashboards and transaction tools will be added in a future step.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-[#e4ebe4] bg-[#f7f9f7] p-4 sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
                  <Settings2 aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Business settings
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Vehicle types, services, pricing, commissions, and categories
                  </p>
                </div>
              </div>
              <Button asChild className="w-full rounded-xl">
                <Link to="/workspace/settings/vehicle-types">
                  {user.role === "MANAGER"
                    ? "View settings"
                    : "Manage settings"}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-[#e4ebe4] bg-[#f7f9f7] p-4 sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
                  <UserRound aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Workers
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Worker records, job history, and commission balances
                  </p>
                </div>
              </div>
              <Button asChild className="w-full rounded-xl" variant="outline">
                <Link to="/workspace/workers">
                  Manage workers
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 border-t border-[#edf1ed] pt-7 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Signed in as
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {user.email}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Account role
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {role.label}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          This preview confirms authentication and role-based access only.
        </p>
      </section>
    </main>
  );
}
