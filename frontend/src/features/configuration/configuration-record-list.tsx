import { Ban, Pencil, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ConfigurationRecord } from "./types";
import type { ConfigurationSection } from "./sections";

interface ConfigurationRecordListProps {
  section: ConfigurationSection;
  records: ConfigurationRecord[];
  canManage: boolean;
  hasFilters: boolean;
  onCreate: () => void;
  onEdit: (record: ConfigurationRecord) => void;
  onDeactivate: (record: ConfigurationRecord) => void;
}

interface RecordCell {
  label: string;
  value: string;
}

export function ConfigurationRecordList({
  section,
  records,
  canManage,
  hasFilters,
  onCreate,
  onEdit,
  onDeactivate,
}: ConfigurationRecordListProps) {
  if (records.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-[#d6e0d7] bg-white px-6 py-14 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#edf5ef] text-primary">
          <Settings2 aria-hidden="true" className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          {hasFilters
            ? "No matching records"
            : `No ${section.title.toLowerCase()} yet`}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {hasFilters
            ? "Try changing the search or filters to find what you need."
            : `Configuration records will appear here after a ${section.singular} is created.`}
        </p>
        {!hasFilters && canManage && (
          <Button className="mt-5 rounded-xl" onClick={onCreate}>
            Add {section.singular}
          </Button>
        )}
      </section>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {records.map((record) => (
          <article
            className="rounded-2xl border border-[#e4ebe4] bg-white p-4 shadow-sm"
            key={record.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-sm font-semibold text-foreground">
                  {getRecordTitle(record)}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {formatDateTime(record.updated_at)}
                </p>
              </div>
              <StatusBadge isActive={record.is_active} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#edf1ed] pt-3">
              {getRecordCells(record).map(({ label, value }) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-[11px] font-medium text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-xs font-medium text-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {canManage && (
              <RecordActions
                canManage={canManage}
                onDeactivate={() => onDeactivate(record)}
                onEdit={() => onEdit(record)}
                record={record}
              />
            )}
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-[#e4ebe4] bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] border-collapse text-left">
            <thead className="bg-[#f7f9f7]">
              <tr>
                {getColumnLabels(section).map((label) => (
                  <th
                    className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    key={label}
                    scope="col"
                  >
                    {label}
                  </th>
                ))}
                <th
                  className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  scope="col"
                >
                  Status
                </th>
                {canManage && (
                  <th
                    className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    scope="col"
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ed]">
              {records.map((record) => (
                <tr className="transition-colors hover:bg-[#fbfcfb]" key={record.id}>
                  {getRecordCells(record).map(({ label, value }) => (
                    <td
                      className="max-w-[280px] px-5 py-4 text-sm text-foreground"
                      key={label}
                    >
                      <span className="block truncate">{value}</span>
                    </td>
                  ))}
                  <td className="px-5 py-4 text-right">
                    <StatusBadge isActive={record.is_active} />
                  </td>
                  {canManage && (
                    <td className="px-5 py-4">
                      <RecordActions
                        canManage={canManage}
                        onDeactivate={() => onDeactivate(record)}
                        onEdit={() => onEdit(record)}
                        record={record}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function getColumnLabels(section: ConfigurationSection) {
  if (section.kind === "service-pricing") {
    return ["Vehicle type", "Service", "Price", "Effective date"];
  }
  if (section.kind === "commission-settings") {
    return ["Commission", "Allocation policy", "Effective date"];
  }
  return ["Name", "Description", "Updated"];
}

function getRecordCells(record: ConfigurationRecord): RecordCell[] {
  if ("vehicle_type_name" in record) {
    return [
      { label: "Vehicle type", value: record.vehicle_type_name },
      { label: "Service", value: record.service_name },
      { label: "Price", value: formatDecimal(record.price) },
      { label: "Effective date", value: formatDate(record.effective_date) },
    ];
  }
  if ("commission_percentage" in record) {
    return [
      {
        label: "Commission",
        value: `${record.commission_percentage}%`,
      },
      {
        label: "Allocation policy",
        value: record.allocation_policy === "EQUAL_SPLIT" ? "Equal split" : record.allocation_policy,
      },
      { label: "Effective date", value: formatDate(record.effective_date) },
    ];
  }
  return [
    { label: "Name", value: record.name },
    { label: "Description", value: record.description || "—" },
    { label: "Updated", value: formatDateTime(record.updated_at) },
  ];
}

function getRecordTitle(record: ConfigurationRecord) {
  if ("name" in record) {
    return record.name;
  }
  if ("vehicle_type_name" in record) {
    return `${record.vehicle_type_name} · ${record.service_name}`;
  }
  return `${record.commission_percentage}% commission`;
}

function RecordActions({
  record,
  canManage,
  onEdit,
  onDeactivate,
}: {
  record: ConfigurationRecord;
  canManage: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  if (!canManage) {
    return null;
  }
  const recordTitle = getRecordTitle(record);

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        aria-label={`Edit ${recordTitle}`}
        className="rounded-lg"
        onClick={onEdit}
        size="sm"
        type="button"
        variant="outline"
      >
        <Pencil aria-hidden="true" className="size-3.5" />
        Edit
      </Button>
      {record.is_active && (
        <Button
          aria-label={`Deactivate ${recordTitle}`}
          className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDeactivate}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Ban aria-hidden="true" className="size-3.5" />
          Deactivate
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        isActive
          ? "bg-emerald-50 text-emerald-800"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          isActive ? "bg-emerald-600" : "bg-slate-400"
        }`}
      />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function formatDecimal(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${groupedWhole}.${fraction.padEnd(2, "0")}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}
