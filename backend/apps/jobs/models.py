from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.configuration.models import (
    CommissionSetting,
    Service,
    ServicePricing,
    VehicleType,
)
from apps.core.models import UUIDTimeStampedModel
from apps.workers.models import Worker


JOB_STATUS_VALUES = ("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED")


class Vehicle(UUIDTimeStampedModel):
    number_plate = models.CharField(max_length=32, db_index=True)
    vehicle_type = models.ForeignKey(
        VehicleType,
        on_delete=models.PROTECT,
        related_name="registered_vehicles",
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vehicles_registered",
    )

    class Meta:
        ordering = ("number_plate",)
        constraints = [
            models.UniqueConstraint(
                Lower("number_plate"),
                name="jobs_vehicle_number_plate_ci_uniq",
            ),
        ]

    def __str__(self):
        return self.number_plate


class Job(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class DiscountType(models.TextChoices):
        NONE = "NONE", "No discount"
        PERCENTAGE = "PERCENTAGE", "Percentage"
        FIXED = "FIXED", "Fixed amount"

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="jobs",
    )
    number_plate = models.CharField(max_length=32, blank=True, default="", db_index=True)
    vehicle_type = models.ForeignKey(
        VehicleType,
        on_delete=models.PROTECT,
        related_name="washing_jobs",
    )
    services = models.ManyToManyField(
        Service,
        through="JobService",
        related_name="washing_jobs",
    )
    workers = models.ManyToManyField(
        Worker,
        through="JobWorkerAssignment",
        related_name="jobs",
    )
    job_date = models.DateField(default=timezone.localdate, db_index=True)
    registered_at = models.DateTimeField(default=timezone.now)
    washing_started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.PENDING,
    )
    total_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    discount_type = models.CharField(
        max_length=10,
        choices=DiscountType.choices,
        default=DiscountType.NONE,
    )
    discount_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    amount_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="washing_jobs_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="washing_jobs_updated",
    )
    discount_applied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="washing_job_discounts_applied",
    )
    idempotency_key = models.UUIDField(null=True, blank=True, unique=True)
    request_fingerprint = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        ordering = ("-job_date", "-registered_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=JOB_STATUS_VALUES),
                name="jobs_valid_status",
            ),
            models.CheckConstraint(
                condition=models.Q(total_price__gte=0),
                name="jobs_total_price_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=0)
                & models.Q(discount_amount__gte=0)
                & models.Q(discount_amount__lte=models.F("subtotal"))
                & models.Q(total_price=models.F("subtotal") - models.F("discount_amount")),
                name="jobs_discount_totals_consistent",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paid__gte=0)
                & models.Q(amount_paid__lte=models.F("total_price")),
                name="jobs_payment_not_over_total",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(status="PENDING")
                    & models.Q(washing_started_at__isnull=True)
                    & models.Q(completed_at__isnull=True)
                    & models.Q(cancelled_at__isnull=True)
                    & models.Q(commission_amount__isnull=True)
                )
                | (
                    models.Q(status="IN_PROGRESS")
                    & models.Q(washing_started_at__isnull=False)
                    & models.Q(completed_at__isnull=True)
                    & models.Q(cancelled_at__isnull=True)
                    & models.Q(commission_amount__isnull=True)
                )
                | (
                    models.Q(status="COMPLETED")
                    & models.Q(completed_at__isnull=False)
                    & models.Q(cancelled_at__isnull=True)
                    & models.Q(commission_amount__isnull=False)
                )
                | (
                    models.Q(status="CANCELLED")
                    & models.Q(completed_at__isnull=True)
                    & models.Q(cancelled_at__isnull=False)
                    & models.Q(commission_amount__isnull=True)
                ),
                name="jobs_status_timestamps_consistent",
            ),
        ]

    def __str__(self):
        return f"{self.number_plate or 'Legacy job'} ({self.job_date.isoformat()})"

    @property
    def amount_due(self):
        if self.status == self.Status.CANCELLED:
            return Decimal("0.00")
        return self.total_price - self.amount_paid

    @property
    def payment_status(self):
        if self.status == self.Status.CANCELLED:
            return "CANCELLED"
        if self.amount_paid <= 0 and self.total_price > 0:
            return "UNPAID"
        if self.amount_paid < self.total_price:
            return "PARTIAL"
        return "PAID"


class JobService(UUIDTimeStampedModel):
    job = models.ForeignKey(
        Job,
        on_delete=models.CASCADE,
        related_name="job_services",
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name="job_service_snapshots",
    )
    pricing_record = models.ForeignKey(
        ServicePricing,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="job_snapshots",
    )
    commission_setting = models.ForeignKey(
        CommissionSetting,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="job_snapshots",
    )
    price_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    commissionable_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    commission_rate_snapshot = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ("service__name",)
        constraints = [
            models.UniqueConstraint(
                fields=("job", "service"),
                name="jobs_unique_service_per_job",
            ),
        ]

    def __str__(self):
        return f"{self.service} snapshot for {self.job}"


class JobWorkerAssignment(UUIDTimeStampedModel):
    job = models.ForeignKey(
        Job,
        on_delete=models.CASCADE,
        related_name="worker_assignments",
    )
    worker = models.ForeignKey(
        Worker,
        on_delete=models.PROTECT,
        related_name="job_assignments",
    )
    commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ("worker__full_name",)
        constraints = [
            models.UniqueConstraint(
                fields=("job", "worker"),
                name="jobs_unique_worker_per_job",
            ),
        ]


class JobPayment(UUIDTimeStampedModel):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile money"
        CARD = "CARD", "Card"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"

    job = models.ForeignKey(
        Job,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    method = models.CharField(
        max_length=20,
        choices=Method.choices,
        default=Method.CASH,
    )
    payment_date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True)
    idempotency_key = models.UUIDField(null=True, blank=True, unique=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="washing_job_payments_recorded",
    )

    class Meta:
        ordering = ("-payment_date", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="jobs_payment_amount_positive",
            ),
        ]

    def __str__(self):
        return f"Payment for {self.job} ({self.amount})"


class ImmutableJobRefundQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise TypeError("Job refund records are immutable.")

    def delete(self):
        raise TypeError("Job refund records are immutable.")


class JobRefund(UUIDTimeStampedModel):
    payment = models.ForeignKey(
        JobPayment,
        on_delete=models.PROTECT,
        related_name="refunds",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    refund_date = models.DateField(default=timezone.localdate, db_index=True)
    reason = models.CharField(max_length=1000)
    idempotency_key = models.UUIDField(unique=True)
    request_fingerprint = models.CharField(max_length=64)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="job_refunds_recorded",
    )

    objects = ImmutableJobRefundQuerySet.as_manager()

    class Meta:
        ordering = ("-refund_date", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="jobs_refund_amount_positive",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Job refund records are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Job refund records are immutable.")

    def __str__(self):
        return f"Refund for payment {self.payment_id} ({self.amount})"
