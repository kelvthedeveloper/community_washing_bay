from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import (
    Count,
    DecimalField,
    F,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, TruncDay, TruncMonth, TruncWeek
from django.utils import timezone

from apps.expenses.models import Expense
from apps.inventory.models import (
    InventoryPurchase,
    InventoryPurchaseLine,
    StockMovement,
)
from apps.jobs.models import Job, JobPayment, JobRefund, JobService
from apps.workers.models import CommissionLedgerEntry, CommissionPayment


ZERO_MONEY = Decimal("0.00")
ZERO_QUANTITY = Decimal("0.000")
MONEY_FIELD = DecimalField(max_digits=20, decimal_places=2)


def build_owner_report(*, start_date, end_date, group_by):
    date_range = (start_date, end_date)
    completed_jobs = Job.objects.filter(
        status=Job.Status.COMPLETED,
        completed_at__date__range=date_range,
    )
    sales_summary = completed_jobs.aggregate(
        jobs=Count("id"),
        unique_vehicles=Count("vehicle_id", distinct=True),
        sales_before_discounts=Sum("subtotal"),
        discounts=Sum("discount_amount"),
        completed_sales=Sum("total_price"),
    )
    completed_sales = sales_summary["completed_sales"] or ZERO_MONEY
    sales_before_discounts = sales_summary["sales_before_discounts"] or ZERO_MONEY
    discounts = sales_summary["discounts"] or ZERO_MONEY

    all_refunds = JobRefund.objects.filter(refund_date__range=date_range)
    refunds_paid = all_refunds.aggregate(total=Sum("amount"))["total"] or ZERO_MONEY
    completed_refunds = all_refunds.filter(
        payment__job__status=Job.Status.COMPLETED
    )
    sales_returns = (
        completed_refunds.aggregate(total=Sum("amount"))["total"] or ZERO_MONEY
    )
    canceled_job_refunds = (
        all_refunds.filter(payment__job__status=Job.Status.CANCELLED)
        .aggregate(total=Sum("amount"))["total"]
        or ZERO_MONEY
    )
    net_revenue = completed_sales - sales_returns

    payments_received = (
        JobPayment.objects.filter(payment_date__range=date_range)
        .aggregate(total=Sum("amount"))["total"]
        or ZERO_MONEY
    )
    net_cash_collected = payments_received - refunds_paid
    sales_by_period = _sales_by_period(completed_jobs, completed_refunds, group_by)
    sales_by_service = _sales_by_service(date_range)
    expenses = _expense_summary(date_range)
    commissions = _commission_summary(date_range)
    inventory = _inventory_summary(date_range)
    outstanding = _outstanding_summary(end_date)

    gross_profit = (
        net_revenue - commissions["net_cost"] - inventory["usage_cost"]
    )
    net_operating_result = gross_profit - expenses["total"]

    opening_summary = {
        "net_revenue": net_revenue,
        "cash_collected": net_cash_collected,
        "expenses": expenses["total"],
        "net_commission_cost": commissions["net_cost"],
        "commission_payouts": commissions["payouts"],
        "inventory_purchases": inventory["purchases"],
        "inventory_usage_cost": inventory["usage_cost"],
        "outstanding_payments": outstanding["amount"],
        "gross_profit_estimate": gross_profit,
        "net_operating_result": net_operating_result,
    }

    return {
        "start_date": start_date,
        "end_date": end_date,
        "group_by": group_by,
        "opening_summary": opening_summary,
        "total_vehicles_serviced": sales_summary["jobs"],
        "unique_vehicles_serviced": sales_summary["unique_vehicles"] or 0,
        "completed_jobs": sales_summary["jobs"],
        "cancelled_jobs": Job.objects.filter(
            cancelled_at__date__range=date_range
        ).count(),
        "revenue_breakdown": {
            "sales_before_discounts": sales_before_discounts,
            "discounts": discounts,
            "completed_sales": completed_sales,
            "sales_returns": sales_returns,
            "net_revenue": net_revenue,
            "payments_received": payments_received,
            "refunds_paid": refunds_paid,
            "net_cash_collected": net_cash_collected,
            "canceled_job_refunds": canceled_job_refunds,
        },
        "sales_by_period": sales_by_period,
        "sales_by_service": sales_by_service,
        "expenses": expenses,
        "commissions": commissions,
        "inventory": inventory,
        "outstanding_payments": outstanding,
        "gross_profit_estimate": gross_profit,
        "net_operating_result": net_operating_result,
    }


def _sales_by_period(completed_jobs, completed_refunds, group_by):
    truncator = {
        "daily": TruncDay,
        "weekly": TruncWeek,
        "monthly": TruncMonth,
    }[group_by]
    grouped_sales = (
        completed_jobs.annotate(
            period=truncator(
                "completed_at",
                tzinfo=timezone.get_current_timezone(),
            )
        )
        .values("period")
        .annotate(
            sales=Sum("total_price"),
            jobs=Count("id"),
            vehicles=Count("vehicle_id", distinct=True),
        )
        .order_by("period")
    )
    grouped = {}
    for row in grouped_sales:
        period_start = _period_start(_as_date(row["period"]), group_by)
        grouped[period_start] = {
            "period_start": period_start,
            "sales": row["sales"] or ZERO_MONEY,
            "refunds": ZERO_MONEY,
            "net_revenue": row["sales"] or ZERO_MONEY,
            "jobs": row["jobs"],
            "vehicles": row["vehicles"],
        }

    for row in completed_refunds.values("refund_date").annotate(
        refunds=Sum("amount")
    ):
        period_start = _period_start(row["refund_date"], group_by)
        values = grouped.setdefault(
            period_start,
            {
                "period_start": period_start,
                "sales": ZERO_MONEY,
                "refunds": ZERO_MONEY,
                "net_revenue": ZERO_MONEY,
                "jobs": 0,
                "vehicles": 0,
            },
        )
        values["refunds"] += row["refunds"] or ZERO_MONEY
        values["net_revenue"] = values["sales"] - values["refunds"]
    return [grouped[key] for key in sorted(grouped)]


def _period_start(value, group_by):
    if group_by == "daily":
        return value
    if group_by == "weekly":
        return value - timedelta(days=value.weekday())
    return value.replace(day=1)


def _as_date(value):
    return value.date() if isinstance(value, datetime) else value


def _sales_by_service(date_range):
    rows = (
        JobService.objects.filter(
            job__status=Job.Status.COMPLETED,
            job__completed_at__date__range=date_range,
            price_snapshot__isnull=False,
        )
        .values("service_id", "service__name")
        .annotate(
            quantity=Count("id"),
            sales_before_discounts=Sum("price_snapshot"),
            discounts=Sum("discount_amount"),
        )
        .order_by("service__name", "service_id")
    )
    result = []
    for row in rows:
        sales = row["sales_before_discounts"] or ZERO_MONEY
        discount = row["discounts"] or ZERO_MONEY
        result.append(
            {
                "service": row["service_id"],
                "service_name": row["service__name"],
                "quantity": row["quantity"],
                "sales_before_discounts": sales,
                "discounts": discount,
                "revenue": sales - discount,
            }
        )
    return result


def _expense_summary(date_range):
    active = Expense.objects.filter(
        expense_date__range=date_range,
        cancelled_at__isnull=True,
    )
    totals = active.aggregate(
        total=Sum("amount"),
        count=Count("id"),
    )
    cancelled = Expense.objects.filter(
        expense_date__range=date_range,
        cancelled_at__isnull=False,
    ).aggregate(
        total=Sum("amount"),
        count=Count("id"),
    )
    categories = list(
        active.values("category_id", "category__name")
        .annotate(count=Count("id"), amount=Sum("amount"))
        .order_by("category__name")
    )
    return {
        "total": totals["total"] or ZERO_MONEY,
        "count": totals["count"],
        "cancelled_amount": cancelled["total"] or ZERO_MONEY,
        "cancelled_count": cancelled["count"],
        "by_category": [
            {
                "category": row["category_id"],
                "category_name": row["category__name"],
                "count": row["count"],
                "amount": row["amount"] or ZERO_MONEY,
            }
            for row in categories
        ],
    }


def _commission_summary(date_range):
    entries = CommissionLedgerEntry.objects.filter(
        effective_date__range=date_range
    )
    entry_totals = entries.aggregate(
        earned=Sum(
            "amount",
            filter=Q(entry_type=CommissionLedgerEntry.EntryType.EARNED),
        ),
        adjustments=Sum(
            "amount",
            filter=Q(entry_type=CommissionLedgerEntry.EntryType.ADJUSTMENT),
        ),
        reversals=Sum(
            "amount",
            filter=Q(entry_type=CommissionLedgerEntry.EntryType.REVERSAL),
        ),
        net=Sum("amount"),
    )
    commission_rows = list(
        entries.values("worker_id", "worker__full_name")
        .annotate(
            earned=Sum(
                "amount",
                filter=Q(entry_type=CommissionLedgerEntry.EntryType.EARNED),
            ),
            adjustments=Sum(
                "amount",
                filter=Q(entry_type=CommissionLedgerEntry.EntryType.ADJUSTMENT),
            ),
            reversals=Sum(
                "amount",
                filter=Q(entry_type=CommissionLedgerEntry.EntryType.REVERSAL),
            ),
            net=Sum("amount"),
        )
        .order_by("worker__full_name", "worker_id")
    )
    payout_rows = list(
        CommissionPayment.objects.filter(payment_date__range=date_range)
        .values("worker_id", "worker__full_name")
        .annotate(count=Count("id"), amount=Sum("amount"))
        .order_by("worker__full_name", "worker_id")
    )
    payouts_by_worker = {
        row["worker_id"]: row for row in payout_rows
    }
    worker_rows = []
    for row in commission_rows:
        payout = payouts_by_worker.pop(row["worker_id"], None)
        worker_rows.append(
            {
                "worker": row["worker_id"],
                "worker_name": row["worker__full_name"],
                "earned": row["earned"] or ZERO_MONEY,
                "adjustments": row["adjustments"] or ZERO_MONEY,
                "reversals": row["reversals"] or ZERO_MONEY,
                "net_commission": row["net"] or ZERO_MONEY,
                "payouts": payout["amount"] if payout else ZERO_MONEY,
            }
        )
    for worker_id, row in payouts_by_worker.items():
        worker_rows.append(
            {
                "worker": worker_id,
                "worker_name": row["worker__full_name"],
                "earned": ZERO_MONEY,
                "adjustments": ZERO_MONEY,
                "reversals": ZERO_MONEY,
                "net_commission": ZERO_MONEY,
                "payouts": row["amount"] or ZERO_MONEY,
            }
        )
    worker_rows.sort(key=lambda row: (row["worker_name"], str(row["worker"])))
    return {
        "earned": entry_totals["earned"] or ZERO_MONEY,
        "adjustments": entry_totals["adjustments"] or ZERO_MONEY,
        "reversals": entry_totals["reversals"] or ZERO_MONEY,
        "net_cost": entry_totals["net"] or ZERO_MONEY,
        "payout_count": sum(row["count"] for row in payout_rows),
        "payouts": sum(
            (row["amount"] or ZERO_MONEY for row in payout_rows),
            ZERO_MONEY,
        ),
        "by_worker": worker_rows,
        "payouts_by_worker": [
            {
                "worker": row["worker_id"],
                "worker_name": row["worker__full_name"],
                "count": row["count"],
                "amount": row["amount"] or ZERO_MONEY,
            }
            for row in payout_rows
        ],
    }


def _inventory_summary(date_range):
    purchase_totals = InventoryPurchase.objects.filter(
        purchase_date__range=date_range
    ).aggregate(count=Count("id"), amount=Sum("total_cost"))
    purchase_lines = (
        InventoryPurchaseLine.objects.filter(
            purchase__purchase_date__range=date_range,
        )
        .values(
            "product_id",
            "product__name",
            "product__unit_label",
        )
        .annotate(quantity=Sum("quantity"), amount=Sum("total_cost"))
        .order_by("product__name", "product_id")
    )
    movements = StockMovement.objects.filter(
        occurred_at__date__range=date_range,
    )
    usage_totals = movements.filter(
        movement_type=StockMovement.Type.USAGE,
    ).aggregate(quantity=Sum("quantity"), amount=Sum("value_change"))
    usage_rows = (
        movements.filter(movement_type=StockMovement.Type.USAGE)
        .values(
            "product_id",
            "product__name",
            "product__unit_label",
        )
        .annotate(quantity=Sum("quantity"), amount=Sum("value_change"))
        .order_by("product__name", "product_id")
    )
    adjustments = movements.filter(
        movement_type=StockMovement.Type.ADJUSTMENT,
    ).aggregate(count=Count("id"), amount=Sum("value_change"))
    return {
        "purchase_count": purchase_totals["count"],
        "purchases": purchase_totals["amount"] or ZERO_MONEY,
        "usage_quantity": -(usage_totals["quantity"] or ZERO_QUANTITY),
        "usage_cost": -(usage_totals["amount"] or ZERO_MONEY),
        "adjustment_count": adjustments["count"],
        "adjustment_value": adjustments["amount"] or ZERO_MONEY,
        "purchases_by_product": [
            {
                "product": row["product_id"],
                "product_name": row["product__name"],
                "unit_label": row["product__unit_label"],
                "quantity": row["quantity"] or ZERO_QUANTITY,
                "amount": row["amount"] or ZERO_MONEY,
            }
            for row in purchase_lines
        ],
        "usage_by_product": [
            {
                "product": row["product_id"],
                "product_name": row["product__name"],
                "unit_label": row["product__unit_label"],
                "quantity": -(row["quantity"] or ZERO_QUANTITY),
                "amount": -(row["amount"] or ZERO_MONEY),
            }
            for row in usage_rows
        ],
    }


def _outstanding_summary(as_of):
    payment_subquery = (
        JobPayment.objects.filter(
            job_id=OuterRef("pk"),
            payment_date__lte=as_of,
        )
        .order_by()
        .values("job_id")
        .annotate(total=Sum("amount"))
        .values("total")[:1]
    )
    refund_subquery = (
        JobRefund.objects.filter(
            payment__job_id=OuterRef("pk"),
            refund_date__lte=as_of,
        )
        .order_by()
        .values("payment__job_id")
        .annotate(total=Sum("amount"))
        .values("total")[:1]
    )
    active_as_of = Job.objects.filter(job_date__lte=as_of).filter(
        Q(cancelled_at__isnull=True) | Q(cancelled_at__date__gt=as_of)
    )
    open_jobs = active_as_of.annotate(
        paid_as_of=Coalesce(
            Subquery(payment_subquery, output_field=MONEY_FIELD),
            Value(ZERO_MONEY),
            output_field=MONEY_FIELD,
        ),
        refunded_as_of=Coalesce(
            Subquery(refund_subquery, output_field=MONEY_FIELD),
            Value(ZERO_MONEY),
            output_field=MONEY_FIELD,
        ),
    ).values("total_price", "paid_as_of", "refunded_as_of")
    outstanding_amount = ZERO_MONEY
    outstanding_jobs = 0
    for row in open_jobs:
        due = max(
            row["total_price"] - row["paid_as_of"] + row["refunded_as_of"],
            ZERO_MONEY,
        )
        if due > ZERO_MONEY:
            outstanding_amount += due
            outstanding_jobs += 1

    cancelled_as_of = Job.objects.filter(cancelled_at__date__lte=as_of).values("pk")
    cancelled_payments = (
        JobPayment.objects.filter(
            job_id__in=cancelled_as_of,
            payment_date__lte=as_of,
        ).aggregate(total=Sum("amount"))["total"]
        or ZERO_MONEY
    )
    cancelled_refunds = (
        JobRefund.objects.filter(
            payment__job_id__in=cancelled_as_of,
            refund_date__lte=as_of,
        ).aggregate(total=Sum("amount"))["total"]
        or ZERO_MONEY
    )
    return {
        "amount": outstanding_amount,
        "job_count": outstanding_jobs,
        "cash_held_for_cancelled_jobs": cancelled_payments - cancelled_refunds,
    }
