from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from apps.configuration.models import CommissionSetting, ServicePricing
from apps.workers.models import CommissionPayment, WorkerJob


ZERO_MONEY = Decimal("0.00")


def get_worker_outstanding_commission(worker):
    accrued = WorkerJob.objects.filter(
        worker=worker,
        status=WorkerJob.Status.COMPLETED,
    ).aggregate(total=Sum("commission_amount"))["total"]
    paid = CommissionPayment.objects.filter(worker=worker).aggregate(
        total=Sum("amount")
    )["total"]
    return (accrued or ZERO_MONEY) - (paid or ZERO_MONEY)


def complete_worker_job(job):
    if job.status != WorkerJob.Status.ASSIGNED:
        raise serializers.ValidationError(
            {"status": "Only assigned jobs can be completed."}
        )

    effective_date = timezone.localdate()
    pricing = (
        ServicePricing.objects.filter(
            vehicle_type=job.vehicle_type,
            service=job.service,
            is_active=True,
            effective_date__lte=effective_date,
        )
        .order_by("-effective_date")
        .first()
    )
    if pricing is None:
        raise serializers.ValidationError(
            {"service": "No active service price is effective for today."}
        )

    commission_setting = (
        CommissionSetting.objects.filter(
            is_active=True,
            effective_date__lte=effective_date,
        )
        .order_by("-effective_date")
        .first()
    )
    if commission_setting is None:
        raise serializers.ValidationError(
            {"commission": "No active commission setting is effective for today."}
        )

    job.status = WorkerJob.Status.COMPLETED
    job.completed_at = timezone.now()
    job.service_price = pricing.price
    job.commission_percentage = commission_setting.commission_percentage
    job.commission_amount = (
        pricing.price * commission_setting.commission_percentage / Decimal("100")
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    job.save(
        update_fields={
            "status",
            "completed_at",
            "service_price",
            "commission_percentage",
            "commission_amount",
            "updated_at",
        }
    )
    return job
