import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LoaderCircle,
  Package,
  Percent,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { getRoleHomePath } from "@/features/auth/protected-route";
import { apiClient } from "@/lib/api-client";

import { ConfigurationDialog } from "./configuration-dialog";
import { ConfigurationRecordList } from "./configuration-record-list";
import { fetchConfigurationPage } from "./api";
import {
  configurationSections,
  getConfigurationEndpoint,
  getConfigurationSection,
  type ConfigurationSection,
} from "./sections";
import type {
  ConfigurationRecord,
  ConfigurationSectionId,
  ConfigurationWritePayload,
  NamedConfigurationRecord,
} from "./types";

const sectionIcons: Record<ConfigurationSectionId, LucideIcon> = {
  "vehicle-types": CarFront,
  services: Sparkles,
  "service-pricing": CircleDollarSign,
  "commission-settings": Percent,
  "expense-categories": ReceiptText,
  "inventory-categories": Boxes,
};

type ActiveFilter = "all" | "true" | "false";
type DialogMode = "create" | "edit" | null;
const pageSize = 10;

export function ConfigurationSettingsPage() {
  const { section: sectionParam } = useParams();
  const section = getConfigurationSection(sectionParam);

  if (!section) {
    return <Navigate replace to="/workspace/settings/vehicle-types" />;
  }

  return (
    <SettingsLayout>
      <ConfigurationSectionPage key={section.id} section={section} />
    </SettingsLayout>
  );
}

function SettingsLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return null;
  }

  const homePath = getRoleHomePath(user.role);
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;
  const isManager = user.role === "MANAGER";

  return (
    <div className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-[#e6ece6] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-5">
            <BrandMark compact />
            <div className="hidden border-l border-[#e6ece6] pl-5 sm:block">
              <p className="text-sm font-semibold text-foreground">
                Business settings
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Configuration
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-40 truncate text-sm font-medium text-foreground">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {isManager ? "Read-only access" : "Configuration access"}
              </p>
            </div>
            <Button asChild className="rounded-xl" size="sm" variant="outline">
              <Link to={homePath}>
                <ArrowLeft aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Workspace</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
        <nav
          aria-label="Business settings"
          className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden"
        >
          {configurationSections.map((item) => {
            const Icon = sectionIcons[item.id];
            const isCurrent =
              location.pathname === `/workspace/settings/${item.id}`;
            return (
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-[#e2e9e2] bg-white text-muted-foreground hover:bg-[#f8faf8] hover:text-foreground"
                }`}
                key={item.id}
                to={`/workspace/settings/${item.id}`}
              >
                <Icon aria-hidden="true" className="size-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-7">
          <aside className="hidden lg:block">
            <div className="sticky top-6 rounded-2xl border border-[#e4ebe4] bg-white p-3 shadow-sm">
              <div className="px-3 pb-3 pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Configuration
                </p>
              </div>
              <nav aria-label="Business settings" className="space-y-1">
                {configurationSections.map((item) => {
                  const Icon = sectionIcons[item.id];
                  const isCurrent =
                    location.pathname === `/workspace/settings/${item.id}`;
                  return (
                    <Link
                      aria-current={isCurrent ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        isCurrent
                          ? "bg-[#edf5ef] text-primary"
                          : "text-muted-foreground hover:bg-[#f7f9f7] hover:text-foreground"
                      }`}
                      key={item.id}
                      to={`/workspace/settings/${item.id}`}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">{item.title}</span>
                      {isCurrent && (
                        <span className="ml-auto size-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-4 border-t border-[#edf1ed] px-3 pt-4">
                <div className="flex items-start gap-2.5">
                  <Settings2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Changes are shared across your business configuration.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

function ConfigurationSectionPage({
  section,
}: {
  section: ConfigurationSection;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedRecord, setSelectedRecord] =
    useState<ConfigurationRecord | null>(null);
  const [recordToDeactivate, setRecordToDeactivate] =
    useState<ConfigurationRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const params = useMemo(() => {
    const query: Record<string, string | number> = {
      page,
      page_size: pageSize,
    };
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      query.search = trimmedSearch;
    }
    if (activeFilter !== "all") {
      query.is_active = activeFilter;
    }
    if (section.id === "service-pricing") {
      if (vehicleTypeFilter) {
        query.vehicle_type = vehicleTypeFilter;
      }
      if (serviceFilter) {
        query.service = serviceFilter;
      }
    }
    if (section.kind !== "named") {
      if (effectiveFrom) {
        query.effective_date__gte = effectiveFrom;
      }
      if (effectiveTo) {
        query.effective_date__lte = effectiveTo;
      }
    }
    return query;
  }, [
    activeFilter,
    effectiveFrom,
    effectiveTo,
    page,
    search,
    section.id,
    section.kind,
    serviceFilter,
    vehicleTypeFilter,
  ]);

  const configurationQuery = useQuery({
    queryKey: ["configuration", section.id, params],
    queryFn: () =>
      fetchConfigurationPage<ConfigurationRecord>(
        getConfigurationEndpoint(section.id),
        params,
      ),
  });
  const vehicleTypesQuery = useQuery({
    queryKey: ["configuration", "vehicle-types", "options"],
    queryFn: () =>
      fetchConfigurationPage<NamedConfigurationRecord>(
        getConfigurationEndpoint("vehicle-types"),
        { page_size: 100 },
      ),
    enabled: section.id === "service-pricing",
    staleTime: 30_000,
  });
  const servicesQuery = useQuery({
    queryKey: ["configuration", "services", "options"],
    queryFn: () =>
      fetchConfigurationPage<NamedConfigurationRecord>(
        getConfigurationEndpoint("services"),
        { page_size: 100 },
      ),
    enabled: section.id === "service-pricing",
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ConfigurationWritePayload) => {
      const endpoint = getConfigurationEndpoint(section.id);
      if (selectedRecord) {
        const response = await apiClient.patch(
          `${endpoint}${selectedRecord.id}/`,
          payload,
        );
        return response.data;
      }
      const response = await apiClient.post(endpoint, payload);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["configuration"] });
      setDialogMode(null);
      setSelectedRecord(null);
      setNotice(
        `${section.singular} ${selectedRecord ? "updated" : "created"} successfully.`,
      );
    },
  });
  const deactivateMutation = useMutation({
    mutationFn: async (record: ConfigurationRecord) => {
      await apiClient.delete(
        `${getConfigurationEndpoint(section.id)}${record.id}/`,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["configuration"] });
      setRecordToDeactivate(null);
      setNotice(`${section.singular} deactivated.`);
    },
  });

  const vehicleTypes = vehicleTypesQuery.data?.results ?? [];
  const services = servicesQuery.data?.results ?? [];
  const optionsError =
    section.id === "service-pricing"
      ? getApiErrorMessage(vehicleTypesQuery.error ?? servicesQuery.error)
      : null;
  const isOptionsLoading =
    section.id === "service-pricing" &&
    (vehicleTypesQuery.isPending || servicesQuery.isPending);

  const hasFilters =
    Boolean(search.trim()) ||
    activeFilter !== "all" ||
    Boolean(vehicleTypeFilter || serviceFilter || effectiveFrom || effectiveTo);

  function clearFilters() {
    setSearch("");
    setActiveFilter("all");
    setVehicleTypeFilter("");
    setServiceFilter("");
    setEffectiveFrom("");
    setEffectiveTo("");
    setPage(1);
  }

  function openCreateDialog() {
    saveMutation.reset();
    setSelectedRecord(null);
    setDialogMode("create");
  }

  function openEditDialog(record: ConfigurationRecord) {
    saveMutation.reset();
    setSelectedRecord(record);
    setDialogMode("edit");
  }

  function closeFormDialog(open: boolean) {
    if (open) {
      return;
    }
    setDialogMode(null);
    setSelectedRecord(null);
    saveMutation.reset();
  }

  const records = configurationQuery.data?.results ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((configurationQuery.data?.count ?? 0) / pageSize),
  );

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Settings</span>
            <ChevronRight aria-hidden="true" className="size-3.5" />
            <span className="text-primary">{section.title}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#17261d] sm:text-3xl">
            {section.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {section.description}
          </p>
        </div>
        {canManage ? (
          <Button
            className="shrink-0 rounded-xl"
            onClick={openCreateDialog}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add {section.singular}
          </Button>
        ) : (
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-[#e2e9e2]">
            <Check aria-hidden="true" className="size-3.5 text-primary" />
            View only
          </span>
        )}
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
        aria-label={`${section.title} filters`}
        className="rounded-2xl border border-[#e4ebe4] bg-white p-3 shadow-sm sm:p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block sm:col-span-2 lg:col-span-2">
            <span className="sr-only">Search {section.title.toLowerCase()}</span>
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
              placeholder={`Search ${section.title.toLowerCase()}…`}
              type="search"
              value={search}
            />
          </label>

          <label className="relative">
            <span className="sr-only">Filter by status</span>
            <select
              className={filterSelectClass}
              onChange={(event) => {
                setActiveFilter(event.target.value as ActiveFilter);
                setPage(1);
              }}
              value={activeFilter}
            >
              <option value="all">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>

          {section.id === "service-pricing" && (
            <>
              <label>
                <span className="sr-only">Filter by vehicle type</span>
                <select
                  className={filterSelectClass}
                  onChange={(event) => {
                    setVehicleTypeFilter(event.target.value);
                    setPage(1);
                  }}
                  value={vehicleTypeFilter}
                >
                  <option value="">All vehicle types</option>
                  {vehicleTypes.map((vehicleType) => (
                    <option key={vehicleType.id} value={vehicleType.id}>
                      {vehicleType.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by service</span>
                <select
                  className={filterSelectClass}
                  onChange={(event) => {
                    setServiceFilter(event.target.value);
                    setPage(1);
                  }}
                  value={serviceFilter}
                >
                  <option value="">All services</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {section.kind !== "named" && (
            <>
              <label className="relative">
                <span className="sr-only">Effective date from</span>
                <CalendarDays
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Effective date from"
                  className="h-11 rounded-xl pl-9"
                  onChange={(event) => {
                    setEffectiveFrom(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={effectiveFrom}
                />
              </label>
              <label className="relative">
                <span className="sr-only">Effective date to</span>
                <Input
                  aria-label="Effective date to"
                  className="h-11 rounded-xl"
                  onChange={(event) => {
                    setEffectiveTo(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={effectiveTo}
                />
              </label>
            </>
          )}
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button
              className="h-8 rounded-lg px-2.5 text-xs"
              onClick={clearFilters}
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-3.5" />
              Clear filters
            </Button>
          </div>
        )}
      </section>

      {configurationQuery.isPending ? (
        <LoadingState />
      ) : configurationQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(configurationQuery.error)}
          onRetry={() => void configurationQuery.refetch()}
        />
      ) : (
        <>
          <div className="flex min-h-6 items-center justify-between gap-3 px-1">
            <p className="text-xs text-muted-foreground">
              {configurationQuery.data.count}{" "}
              {configurationQuery.data.count === 1 ? "record" : "records"}
            </p>
            {configurationQuery.isFetching && (
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
          <ConfigurationRecordList
            canManage={canManage}
            hasFilters={hasFilters}
            onCreate={openCreateDialog}
            onDeactivate={(record) => {
              deactivateMutation.reset();
              setRecordToDeactivate(record);
            }}
            onEdit={openEditDialog}
            records={records}
            section={section}
          />
          {configurationQuery.data.count > pageSize && (
            <div className="flex items-center justify-between rounded-xl border border-[#e4ebe4] bg-white px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  aria-label="Previous page"
                  className="size-9 rounded-lg"
                  disabled={!configurationQuery.data.previous}
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
                  disabled={!configurationQuery.data.next}
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

      {dialogMode && (
        <ConfigurationDialog
          error={
            saveMutation.isError
              ? getApiErrorMessage(saveMutation.error)
              : null
          }
          isSaving={saveMutation.isPending}
          onOpenChange={closeFormDialog}
          onSubmit={(payload) => saveMutation.mutate(payload)}
          open={dialogMode !== null}
          record={dialogMode === "edit" ? selectedRecord : null}
          section={section}
          services={services}
          optionsError={optionsError}
          optionsLoading={isOptionsLoading}
          vehicleTypes={vehicleTypes}
        />
      )}

      {recordToDeactivate && (
        <Dialog
          description="This record will be marked inactive and retained for historical reference."
          onOpenChange={(open) => {
            if (!open) {
              setRecordToDeactivate(null);
              deactivateMutation.reset();
            }
          }}
          open
          title={`Deactivate ${getRecordName(recordToDeactivate)}?`}
        >
          <div className="space-y-5">
            {deactivateMutation.isError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                {getApiErrorMessage(deactivateMutation.error)}
              </div>
            )}
            <div className="rounded-xl bg-[#f6f8f6] p-4 text-sm leading-6 text-muted-foreground">
              You can reactivate this record later by editing its status. It
              will not be deleted.
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-[#edf1ed] pt-4 sm:flex-row sm:justify-end">
              <Button
                className="rounded-xl"
                disabled={deactivateMutation.isPending}
                onClick={() => setRecordToDeactivate(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(recordToDeactivate)}
                type="button"
                variant="destructive"
              >
                {deactivateMutation.isPending
                  ? "Deactivating…"
                  : "Deactivate record"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3" role="status">
      <div className="flex items-center gap-2 rounded-2xl border border-[#e4ebe4] bg-white px-5 py-5 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading configuration…
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
    <div
      className="rounded-2xl border border-red-200 bg-white px-6 py-10 text-center"
      role="alert"
    >
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-red-50 text-destructive">
        <Package aria-hidden="true" className="size-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        Configuration could not be loaded
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

function getApiErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    if (!error.response) {
      return "Could not reach the server. Check your connection and try again.";
    }
    const responseData: unknown = error.response.data;
    if (
      responseData &&
      typeof responseData === "object" &&
      !Array.isArray(responseData)
    ) {
      const errorObject = responseData as Record<string, unknown>;
      for (const key of ["detail", "message"]) {
        if (typeof errorObject[key] === "string") {
          return errorObject[key];
        }
      }
    }
    const messages = collectErrorMessages(responseData);
    if (messages.length > 0) {
      return [...new Set(messages)].join(" ");
    }
  }
  return "Something went wrong. Please try again.";
}

function collectErrorMessages(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectErrorMessages);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectErrorMessages);
  }
  return [];
}

function getRecordName(record: ConfigurationRecord) {
  if ("name" in record) {
    return record.name;
  }
  if ("vehicle_type_name" in record) {
    return `${record.vehicle_type_name} / ${record.service_name}`;
  }
  return `${record.commission_percentage}% commission setting`;
}

const filterSelectClass =
  "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
