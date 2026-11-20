import calendar
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum

from apps.workers.models import CommissionLedgerEntry, CommissionPayment


ZERO_MONEY = Decimal("0.00")


def get_worker_outstanding_commission(worker):
    earned = CommissionLedgerEntry.objects.filter(worker=worker).aggregate(
        total=Sum("amount")
    )["total"]
    paid = CommissionPayment.objects.filter(worker=worker).aggregate(
        total=Sum("amount")
    )["total"]
    return (earned or ZERO_MONEY) - (paid or ZERO_MONEY)


def get_worker_commission_summary(worker, *, summary_date, period):
    if period == "daily":
        period_start = summary_date
        period_end = summary_date
    elif period == "weekly":
        period_start = summary_date - timedelta(days=summary_date.weekday())
        period_end = period_start + timedelta(days=6)
    elif period == "monthly":
        period_start = summary_date.replace(day=1)
        period_end = summary_date.replace(
            day=calendar.monthrange(summary_date.year, summary_date.month)[1]
        )
    else:
        raise ValueError(f"Unsupported commission summary period: {period}")

    earned = CommissionLedgerEntry.objects.filter(
        worker=worker,
        effective_date__range=(period_start, period_end),
    ).aggregate(total=Sum("amount"))["total"] or ZERO_MONEY
    paid = CommissionPayment.objects.filter(
        worker=worker,
        payment_date__range=(period_start, period_end),
    ).aggregate(total=Sum("amount"))["total"] or ZERO_MONEY
    summary = {
        "period": period,
        "period_start": period_start,
        "period_end": period_end,
        "earned_commission": earned,
        "paid_commission": paid,
        "outstanding_commission": get_worker_outstanding_commission(worker),
    }
    if period == "daily":
        summary["date"] = summary_date
        summary["daily_commission"] = earned
    return summary
