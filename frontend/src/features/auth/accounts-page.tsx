import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, LoaderCircle, Pencil, Plus, ShieldCheck, UserRound, UserCheck, UserX } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { getRoleHomePath } from "@/features/auth/protected-route";
import { getWorkerApiErrorMessage, formatDate } from "@/features/workers/utils";

import {
  createManagedAccount,
  fetchManagedAccounts,
  updateManagedAccount,
  type ManagedAccount,
} from "./dashboard-api";

type AccountFormValue = {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: ManagedAccount["role"];
  password: string;
  password_confirmation: string;
};

const emptyForm: AccountFormValue = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "MANAGER",
  password: "",
  password_confirmation: "",
};

export function AccountsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<ManagedAccount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const accountsQuery = useQuery({
    queryKey: ["managed-accounts", page],
    queryFn: () => fetchManagedAccounts({ page, page_size: 100 }),
  });
  const saveMutation = useMutation({
    mutationFn: (values: AccountFormValue) => {
      if (formMode === "edit" && selectedAccount) {
        return updateManagedAccount(selectedAccount.id, {
          email: values.email,
          first_name: values.first_name,
          last_name: values.last_name,
          ...(user?.role === "SUPER_ADMIN" ? { role: values.role } : {}),
        });
      }
      return createManagedAccount(values);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["managed-accounts"] });
      setFormMode(null);
      setSelectedAccount(null);
      setNotice(formMode === "edit" ? "Account updated." : "Account created.");
    },
  });
  const activeMutation = useMutation({
    mutationFn: (values: { account: ManagedAccount; isActive: boolean }) =>
      updateManagedAccount(values.account.id, { is_active: values.isActive }),
    onSuccess: async (_account, values) => {
      await queryClient.invalidateQueries({ queryKey: ["managed-accounts"] });
      setNotice(values.isActive ? "Account activated." : "Account deactivated.");
      setActionError(null);
    },
    onError: (error) => setActionError(getWorkerApiErrorMessage(error)),
  });

  if (!user) {
    return null;
  }
  const accounts = accountsQuery.data?.results ?? [];

  function openCreate() {
    saveMutation.reset();
    setSelectedAccount(null);
    setFormMode("create");
  }

  function openEdit(account: ManagedAccount) {
    saveMutation.reset();
    setSelectedAccount(account);
    setFormMode("edit");
  }

  function toggleActive(account: ManagedAccount) {
    const isActive = !account.is_active;
    if (
      (account.id === user?.id && !isActive)
      || !window.confirm(`${isActive ? "Activate" : "Deactivate"} ${account.username}?`)
    ) {
      return;
    }
    setActionError(null);
    activeMutation.mutate({ account, isActive });
  }

  return (
    <div className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <div className="flex items-center gap-5">
            <BrandMark compact />
            <div className="hidden border-l border-[#e6ece6] pl-5 sm:block">
              <p className="text-sm font-semibold">User management</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Business login accounts</p>
            </div>
          </div>
          <Button asChild className="rounded-xl" size="sm" variant="outline">
            <Link to={getRoleHomePath(user.role)}><ArrowLeft aria-hidden="true" className="size-4" />Dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-7 sm:py-8">
        <section className="rounded-2xl border border-[#e4ebe4] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <ShieldCheck aria-hidden="true" className="size-4" />
                {user.role === "SUPER_ADMIN" ? "System access" : "Team access"}
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#17261d]">User accounts</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {user.role === "SUPER_ADMIN"
                  ? "Manage business login accounts across all roles."
                  : "Create and manage Manager accounts for daily operations."}
              </p>
            </div>
            <Button className="rounded-xl" onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />Add account
            </Button>
          </div>

          {notice && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{notice}</p>}
          {actionError && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{actionError}</p>}

          {accountsQuery.isPending ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />Loading accounts…
            </div>
          ) : accountsQuery.isError ? (
            <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">
              {getWorkerApiErrorMessage(accountsQuery.error)}
            </p>
          ) : accounts.length === 0 ? (
            <div className="py-12 text-center">
              <UserRound aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No accounts found</p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#edf1ed] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3 pl-0">Account</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Joined</th>
                    <th className="px-3 py-3 pr-0 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr className="border-b border-[#f0f3f0] last:border-0" key={account.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{[account.first_name, account.last_name].filter(Boolean).join(" ") || account.username}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{account.email}</p>
                      </td>
                      <td className="px-3 py-3">{account.role.replace("_", " ")}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                          {account.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDate(account.date_joined)}</td>
                      <td className="py-3 pl-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button aria-label={`Edit ${account.username}`} className="rounded-lg" onClick={() => openEdit(account)} size="icon" variant="ghost">
                            <Pencil aria-hidden="true" className="size-4" />
                          </Button>
                          {account.id !== user.id && (
                            <Button
                              aria-label={`${account.is_active ? "Deactivate" : "Activate"} ${account.username}`}
                              className={`rounded-lg ${account.is_active ? "text-destructive" : "text-primary"}`}
                              disabled={activeMutation.isPending}
                              onClick={() => void toggleActive(account)}
                              size="icon"
                              variant="ghost"
                            >
                              {account.is_active ? <UserX aria-hidden="true" className="size-4" /> : <UserCheck aria-hidden="true" className="size-4" />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {accountsQuery.data && accountsQuery.data.count > 100 && (
            <div className="mt-4 flex items-center justify-between border-t border-[#edf1ed] pt-4">
              <p className="text-xs text-muted-foreground">{accountsQuery.data.count} accounts</p>
              <div className="flex gap-2">
                <Button className="rounded-lg" disabled={!accountsQuery.data.previous || page === 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="outline">Previous</Button>
                <Button className="rounded-lg" disabled={!accountsQuery.data.next} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Next</Button>
              </div>
            </div>
          )}
        </section>
      </main>

      {formMode && (
        <AccountDialog
          account={selectedAccount}
          error={saveMutation.isError ? getWorkerApiErrorMessage(saveMutation.error) : null}
          isSaving={saveMutation.isPending}
          onClose={() => {
            setFormMode(null);
            saveMutation.reset();
          }}
          onSubmit={(values) => saveMutation.mutate(values)}
          role={user.role}
          mode={formMode}
          isSelf={selectedAccount?.id === user.id}
        />
      )}
    </div>
  );
}

function AccountDialog({
  account,
  error,
  isSaving,
  mode,
  role,
  isSelf,
  onClose,
  onSubmit,
}: {
  account: ManagedAccount | null;
  error: string | null;
  isSaving: boolean;
  mode: "create" | "edit";
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER";
  isSelf: boolean;
  onClose: () => void;
  onSubmit: (values: AccountFormValue) => void;
}) {
  const [values, setValues] = useState<AccountFormValue>({
    ...emptyForm,
    username: account?.username ?? "",
    email: account?.email ?? "",
    first_name: account?.first_name ?? "",
    last_name: account?.last_name ?? "",
    role: account?.role ?? "MANAGER",
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const isEditing = mode === "edit";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    if (!isEditing && values.password !== values.password_confirmation) {
      setValidationError("Passwords do not match.");
      return;
    }
    onSubmit(values);
  }

  function updateField<Key extends keyof AccountFormValue>(key: Key, value: AccountFormValue[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog
      description={isEditing ? "Update account profile and permitted role." : "Create a secure login for a team member."}
      onOpenChange={(open) => !open && onClose()}
      open
      title={isEditing ? `Edit ${account?.username}` : "Create user account"}
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
        {validationError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{validationError}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Username">
            <Input className="rounded-xl" disabled={isEditing} onChange={(event) => updateField("username", event.target.value)} required value={values.username} />
          </Field>
          <Field label="Email">
            <Input className="rounded-xl" onChange={(event) => updateField("email", event.target.value)} required type="email" value={values.email} />
          </Field>
          <Field label="First name">
            <Input className="rounded-xl" onChange={(event) => updateField("first_name", event.target.value)} value={values.first_name} />
          </Field>
          <Field label="Last name">
            <Input className="rounded-xl" onChange={(event) => updateField("last_name", event.target.value)} value={values.last_name} />
          </Field>
          <Field label="Role">
            <select
              className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm"
              disabled={(isEditing && role !== "SUPER_ADMIN") || (isEditing && isSelf)}
              onChange={(event) => updateField("role", event.target.value as ManagedAccount["role"])}
              value={values.role}
            >
              {role === "SUPER_ADMIN" && <option value="SUPER_ADMIN">Super Admin</option>}
              {role === "SUPER_ADMIN" && <option value="ADMIN">Admin</option>}
              <option value="MANAGER">Manager</option>
            </select>
          </Field>
        </div>
        {!isEditing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Password">
              <Input autoComplete="new-password" className="rounded-xl" minLength={8} onChange={(event) => updateField("password", event.target.value)} required type="password" value={values.password} />
            </Field>
            <Field label="Confirm password">
              <Input autoComplete="new-password" className="rounded-xl" minLength={8} onChange={(event) => updateField("password_confirmation", event.target.value)} required type="password" value={values.password_confirmation} />
            </Field>
          </div>
        )}
        <div className="flex justify-end gap-3 border-t border-[#edf1ed] pt-4">
          <Button className="rounded-xl" disabled={isSaving} onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button className="rounded-xl" disabled={isSaving} type="submit">{isSaving ? "Saving…" : isEditing ? "Save changes" : "Create account"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium">{label}{children}</label>;
}
