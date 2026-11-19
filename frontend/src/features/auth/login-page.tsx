import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  Waves,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { isAxiosError } from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useAuth } from "./auth-context";
import { getRoleHomePath, type LoginLocationState } from "./protected-route";

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter your username or email address.")
    .max(254, "Username or email must be 254 characters or fewer."),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Password must be 128 characters or fewer."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function getLoginErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    if (error.response?.status === 429) {
      return "Too many sign-in attempts. Please wait a moment and try again.";
    }
    if (error.response?.status === 401) {
      return "The username or password you entered is incorrect.";
    }
    if (!error.response) {
      return "We could not reach the sign-in service. Check your connection and try again.";
    }
    const detail = error.response.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return "We couldn't sign you in. Please try again.";
}

export function LoginPage() {
  const { login, isLoading, sessionNotice, clearSessionNotice } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LoginLocationState | null;
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    clearSessionNotice();
    try {
      const user = await login(values);
      const returnPath = locationState?.from?.pathname;
      const destination =
        returnPath?.startsWith("/") && !returnPath.startsWith("//")
          ? returnPath
          : getRoleHomePath(user.role);
      navigate(destination, { replace: true });
    } catch (error) {
      setFormError(getLoginErrorMessage(error));
    }
  }

  const notice = locationState?.notice ?? sessionNotice;

  return (
    <main className="min-h-screen bg-[#f5f8f5] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col xl:px-16">
        <div className="pointer-events-none absolute -right-36 -top-32 size-[34rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-20 -top-16 size-[25rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-48 -left-28 size-[34rem] rounded-full bg-white/[0.04]" />
        <div className="pointer-events-none absolute bottom-20 right-20 size-48 rounded-full bg-emerald-300/10 blur-3xl" />

        <div className="relative z-10 flex items-center justify-between">
          <BrandMark inverse />
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/75">
            Team sign-in
          </span>
        </div>

        <div className="relative z-10 my-auto max-w-xl py-20">
          <div className="mb-8 inline-flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08]">
            <Waves aria-hidden="true" className="size-7 text-emerald-200" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">
            A better way to work together
          </p>
          <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.14] tracking-tight text-white xl:text-5xl">
            Good service starts with a team that feels in control.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/70">
            A secure, dependable workspace for the people who keep your
            community washing bay moving.
          </p>

          <div className="mt-10 space-y-4">
            {[
              "One secure place for your business team",
              "Access tailored to each team member's role",
              "Designed for clear, confident daily operations",
            ].map((item) => (
              <div className="flex items-center gap-3" key={item}>
                <CheckCircle2
                  aria-hidden="true"
                  className="size-5 shrink-0 text-emerald-200"
                />
                <span className="text-sm text-white/80">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-5 text-xs text-white/55">
          <span>Built for your community. Ready for the work ahead.</span>
          <span>Secure access</span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-10">
        <div className="w-full max-w-[440px]">
          <div className="mb-10 lg:hidden">
            <BrandMark />
          </div>

          <div className="rounded-3xl border border-[#e7ede7] bg-white p-6 shadow-[0_20px_60px_-40px_rgba(19,62,45,0.32)] sm:p-9">
            <div className="mb-8">
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-[#edf5ef] text-primary">
                <ShieldCheck aria-hidden="true" className="size-6" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Secure team access
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#17261d]">
                Welcome back
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Sign in to continue to your Community Washing Bay workspace.
              </p>
            </div>

            {notice && (
              <div
                className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900"
                role="status"
              >
                {notice}
              </div>
            )}

            {formError && (
              <div
                className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-800"
                role="alert"
              >
                {formError}
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-[#27382d]"
                  htmlFor="username"
                >
                  Username or email
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    <UserRound aria-hidden="true" className="size-[18px]" />
                  </span>
                  <Input
                    autoComplete="username"
                    aria-describedby={errors.username ? "username-error" : undefined}
                    aria-invalid={Boolean(errors.username)}
                    className="pl-10"
                    id="username"
                    placeholder="Enter your username or email"
                    {...register("username")}
                  />
                </div>
                {errors.username && (
                  <p className="text-xs font-medium text-destructive" id="username-error">
                    {errors.username.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    className="text-sm font-medium text-[#27382d]"
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <span className="text-xs text-muted-foreground">
                    Contact your administrator if you need help
                  </span>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    <LockKeyhole aria-hidden="true" className="size-[17px]" />
                  </span>
                  <Input
                    autoComplete="current-password"
                    aria-describedby={errors.password ? "password-error" : undefined}
                    aria-invalid={Boolean(errors.password)}
                    className="pr-12 pl-10"
                    id="password"
                    placeholder="Enter your password"
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                  />
                  <button
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-[18px]" />
                    ) : (
                      <Eye aria-hidden="true" className="size-[18px]" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs font-medium text-destructive" id="password-error">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                className="mt-2 h-12 w-full rounded-xl text-sm font-semibold shadow-sm"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in to your account
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-7 flex items-start gap-3 border-t border-[#edf1ed] pt-5">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Your sign-in is protected. Access is granted according to your
                assigned business role.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © 2026 Community Washing Bay
            <span className="mx-2 text-[#c6d0c8]">·</span>
            Secure staff portal
          </p>
        </div>
      </section>
    </main>
  );
}
