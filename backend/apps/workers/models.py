from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.configuration.models import Service, VehicleType
from apps.core.models import UUIDTimeStampedModel


WORKER_JOB_STATUSES = ("ASSIGNED", "COMPLETED", "CANCELLED")


class Worker(UUIDTimeStampedModel):
    full_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=32)
    address = models.TextField(blank=True)
    employment_date = models.DateField()
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("full_name",)

    def __str__(self):
        return self.full_name

    def deactivate(self):
        if self.is_active:
            self.is_active = False
            self.save(update_fields={"is_active", "updated_at"})


class WorkerJob(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    worker = models.ForeignKey(
        Worker,
        on_delete=models.PROTECT,
        related_name="jobs",
    )
    vehicle_type = models.ForeignKey(
        VehicleType,
        on_delete=models.PROTECT,
        related_name="worker_jobs",
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name="worker_jobs",
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.ASSIGNED,
    )
    assigned_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    service_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    commission_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(Decimal("0.00")),
            MaxValueValidator(Decimal("100.00")),
        ],
    )
    commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ("-assigned_at", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=WORKER_JOB_STATUSES),
                name="workers_job_valid_status",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(status="COMPLETED")
                    & models.Q(completed_at__isnull=False)
                    & models.Q(service_price__isnull=False)
                    & models.Q(commission_percentage__isnull=False)
                    & models.Q(commission_amount__isnull=False)
                )
                | (
                    models.Q(status__in=("ASSIGNED", "CANCELLED"))
                    & models.Q(completed_at__isnull=True)
                    & models.Q(service_price__isnull=True)
                    & models.Q(commission_percentage__isnull=True)
                    & models.Q(commission_amount__isnull=True)
                ),
                name="workers_job_completion_snapshot_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(commission_percentage__isnull=True)
                | models.Q(
                    commission_percentage__gte=0,
                    commission_percentage__lte=100,
                ),
                name="workers_job_commission_percentage_valid",
            ),
        ]

    def __str__(self):
        return f"{self.service} for {self.worker}"

    def save(self, *args, **kwargs):
        old_worker_id = None
        if not self._state.adding:
            old_worker_id = (
                type(self).objects.filter(pk=self.pk)
                .values_list("worker_id", flat=True)
                .first()
            )
        if self.worker_id and (
            self._state.adding or old_worker_id != self.worker_id
        ):
            if not Worker.objects.filter(
                pk=self.worker_id,
                is_active=True,
            ).exists():
                raise ValidationError(
                    {"worker": "Inactive workers cannot be assigned to new jobs."}
                )
        super().save(*args, **kwargs)


class CommissionPayment(UUIDTimeStampedModel):
    worker = models.ForeignKey(
        Worker,
        on_delete=models.PROTECT,
        related_name="commission_payments",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    payment_date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worker_commission_payments",
    )

    class Meta:
        ordering = ("-payment_date", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="workers_payment_amount_positive",
            ),
        ]

    def __str__(self):
        return f"{self.worker} commission payment ({self.amount})"
