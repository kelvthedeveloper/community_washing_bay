import { isAxiosError } from "axios";

export function getWorkerApiErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    if (!error.response) {
      return "Could not reach the server. Check your connection and try again.";
    }
    const data: unknown = error.response.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const errorObject = data as Record<string, unknown>;
      for (const key of ["detail", "message"]) {
        if (typeof errorObject[key] === "string") {
          return errorObject[key];
        }
      }
    }
    const messages = collectMessages(data);
    if (messages.length > 0) {
      return [...new Set(messages)].join(" ");
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function collectMessages(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectMessages);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectMessages);
  }
  return [];
}

export function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatMoney(value: string | null) {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
