import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { fetchJobReceipt } from "@/features/jobs/api";
import { formatDate, formatDateTime, formatMoney, getWorkerApiErrorMessage } from "@/features/workers/utils";

export function ReceiptPage() {
  const { jobId } = useParams();
  const receiptQuery = useQuery({
    queryKey: ["job-receipt", jobId],
    queryFn: () => fetchJobReceipt(jobId ?? ""),
    enabled: Boolean(jobId),
  });

  if (!jobId) {
    return <Navigate replace to="/workspace/pos" />;
  }

  return (
    <main className="min-h-screen bg-[#f5f8f5] px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl print:max-w-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Button asChild className="rounded-xl" variant="outline">
            <Link to="/workspace/pos">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to POS
            </Link>
          </Button>
          <Button className="rounded-xl" disabled={!receiptQuery.data} onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" />
            Print receipt
          </Button>
        </div>

        {receiptQuery.isPending ? (
          <div className="rounded-2xl border border-[#e4ebe4] bg-white p-8 text-center text-sm text-muted-foreground" role="status">
            Loading receipt…
          </div>
        ) : receiptQuery.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
            {getWorkerApiErrorMessage(receiptQuery.error)}
          </div>
        ) : (
          <article className="rounded-2xl border border-[#e4ebe4] bg-white p-6 shadow-sm sm:p-9 print:rounded-none print:border-0 print:p-0 print:shadow-none">
            <header className="flex flex-col items-center border-b border-dashed border-slate-300 pb-6 text-center">
              <BrandMark compact />
              <h1 className="mt-5 text-xl font-bold tracking-tight text-[#17261d]">Washing sale receipt</h1>
              <p className="mt-1 text-sm text-muted-foreground">Receipt {receiptQuery.data.receipt_number}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Issued {formatDateTime(receiptQuery.data.issued_at)}
              </p>
            </header>

            <section className="grid gap-3 border-b border-dashed border-slate-300 py-5 text-sm sm:grid-cols-2">
              <ReceiptField label="Number plate" value={receiptQuery.data.job.number_plate || "—"} />
              <ReceiptField label="Vehicle type" value={receiptQuery.data.job.vehicle_type_name} />
              <ReceiptField label="Sale date" value={formatDate(receiptQuery.data.job.job_date)} />
              <ReceiptField
                label="Cashier"
                value={receiptQuery.data.job.created_by_name || "—"}
              />
              <ReceiptField
                label="Washers"
                value={receiptQuery.data.job.assigned_workers.map((worker) => worker.worker_name).join(", ") || "—"}
              />
              <ReceiptField
                label="Status"
                value={receiptQuery.data.job.status.replace("_", " ")}
              />
            </section>

            <section className="py-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Service breakdown
              </h2>
              <div className="space-y-3">
                {receiptQuery.data.job.services.map((service) => (
                  <div className="flex justify-between gap-4 text-sm" key={service.service}>
                    <span>{service.service_name}</span>
                    <span className="text-right">
                      {service.discount_amount !== "0.00" && (
                        <span className="mr-2 text-xs text-muted-foreground line-through">
                          {formatMoney(service.price_snapshot)}
                        </span>
                      )}
                      {formatMoney(service.commissionable_amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
                <ReceiptTotal label="Subtotal" amount={receiptQuery.data.job.subtotal} />
                {Number(receiptQuery.data.job.discount_amount) > 0 && (
                  <ReceiptTotal
                    label={`Discount${receiptQuery.data.job.discount_type === "PERCENTAGE" ? ` (${receiptQuery.data.job.discount_value}%)` : ""}`}
                    amount={`-${receiptQuery.data.job.discount_amount}`}
                  />
                )}
                <ReceiptTotal
                  emphasized
                  label="Sale total"
                  amount={receiptQuery.data.job.total_price}
                />
              </div>
            </section>

            <section className="border-t border-dashed border-slate-300 py-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payments
              </h2>
              {receiptQuery.data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payment received yet.</p>
              ) : (
                <div className="space-y-3">
                  {receiptQuery.data.payments.map((payment) => (
                    <div className="flex justify-between gap-4 text-sm" key={payment.id}>
                      <span>
                        {formatDate(payment.payment_date)} · {payment.method.replace("_", " ")}
                      </span>
                      <span>{formatMoney(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {receiptQuery.data.refunds.length > 0 && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Refunds
                  </h3>
                  <div className="space-y-3">
                    {receiptQuery.data.refunds.map((refund) => (
                      <div className="flex justify-between gap-4 text-sm text-red-700" key={refund.id}>
                        <span>
                          {formatDate(refund.refund_date)} · {refund.method.replace("_", " ")}
                          {refund.reason ? ` · ${refund.reason}` : ""}
                        </span>
                        <span>−{formatMoney(refund.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
                <ReceiptTotal label="Net amount paid" amount={receiptQuery.data.job.amount_paid} />
                <ReceiptTotal emphasized label="Outstanding balance" amount={receiptQuery.data.job.amount_due} />
              </div>
            </section>

            <footer className="border-t border-dashed border-slate-300 pt-5 text-center text-xs text-muted-foreground">
              Thank you for choosing Community Washing Bay.
            </footer>
          </article>
        )}
      </div>
    </main>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}

function ReceiptTotal({
  label,
  amount,
  emphasized = false,
}: {
  label: string;
  amount: string;
  emphasized?: boolean;
}) {
  return (
    <p className={`flex justify-between gap-4 ${emphasized ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>{amount.startsWith("-") ? `−${formatMoney(amount.slice(1))}` : formatMoney(amount)}</span>
    </p>
  );
}
