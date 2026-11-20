from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core.models import UUIDTimeStampedModel


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


class CommissionLedgerQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise TypeError("Commission ledger entries are immutable.")

    def delete(self):
        raise TypeError("Commission ledger entries are immutable.")


class CommissionLedgerEntry(UUIDTimeStampedModel):
    class EntryType(models.TextChoices):
        EARNED = "EARNED", "Earned"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        REVERSAL = "REVERSAL", "Reversal"

    worker = models.ForeignKey(
        Worker,
        on_delete=models.PROTECT,
        related_name="commission_ledger_entries",
    )
    job = models.ForeignKey(
        "jobs.Job",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="commission_ledger_entries",
    )
    assignment = models.ForeignKey(
        "jobs.JobWorkerAssignment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="commission_ledger_entries",
    )
    source_entry = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reversal_entries",
    )
    entry_type = models.CharField(max_length=12, choices=EntryType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    effective_date = models.DateField(default=timezone.localdate, db_index=True)
    reason = models.TextField()
    commission_base_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    commission_rate_snapshot = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    allocation_policy_snapshot = models.CharField(
        max_length=20,
        choices=(
            ("EQUAL_SPLIT", "Equal split"),
            ("PER_WORKER", "Full percentage per worker"),
        ),
        null=True,
        blank=True,
    )
    allocation_worker_count_snapshot = models.PositiveIntegerField(
        null=True,
        blank=True,
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worker_commission_ledger_entries",
    )

    objects = CommissionLedgerQuerySet.as_manager()

    class Meta:
        ordering = ("-effective_date", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("assignment",),
                condition=models.Q(
                    entry_type="EARNED",
                    assignment__isnull=False,
                ),
                name="workers_commission_earned_assignment_uniq",
            ),
            models.UniqueConstraint(
                fields=("source_entry",),
                condition=models.Q(
                    entry_type="REVERSAL",
                    source_entry__isnull=False,
                ),
                name="workers_commission_reversal_source_uniq",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        entry_type="EARNED",
                        assignment__isnull=False,
                        job__isnull=False,
                        allocation_policy_snapshot__in=(
                            "EQUAL_SPLIT",
                            "PER_WORKER",
                        ),
                        allocation_worker_count_snapshot__gt=0,
                    )
                    | ~models.Q(entry_type="EARNED")
                ),
                name="workers_commission_earned_snapshot_complete",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(entry_type="EARNED", amount__gte=0)
                    | ~models.Q(entry_type="EARNED")
                ),
                name="workers_commission_earned_nonnegative",
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(entry_type__in=("ADJUSTMENT", "REVERSAL"))
                    | ~models.Q(amount=0)
                ),
                name="workers_commission_corrections_nonzero",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    entry_type__in=("EARNED", "ADJUSTMENT", "REVERSAL")
                ),
                name="workers_commission_entry_type_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(entry_type="REVERSAL", source_entry__isnull=False)
                    | ~models.Q(entry_type="REVERSAL")
                ),
                name="workers_commission_reversal_has_source",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Commission ledger entries are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Commission ledger entries are immutable.")

    def __str__(self):
        return f"{self.worker} commission {self.entry_type.lower()} ({self.amount})"
