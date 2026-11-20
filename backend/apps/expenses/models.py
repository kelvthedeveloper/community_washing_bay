import uuid
from decimal import Decimal
from pathlib import PurePosixPath

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import UUIDTimeStampedModel


def expense_receipt_path(instance, filename):
    suffix = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    return f"expenses/{instance.pk}/{uuid.uuid4().hex}{suffix}"


class ImmutableExpenseQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise TypeError("Expense changes must be recorded through the expense service.")

    def delete(self):
        raise TypeError("Financial expenses cannot be deleted.")


class Expense(UUIDTimeStampedModel):
    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile money"
        CARD = "CARD", "Card"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"

    category = models.ForeignKey(
        "configuration.ExpenseCategory",
        on_delete=models.PROTECT,
        related_name="expenses",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    description = models.CharField(max_length=4000)
    expense_date = models.DateField(default=timezone.localdate, db_index=True)
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
    )
    receipt = models.FileField(
        upload_to=expense_receipt_path,
        blank=True,
    )
    receipt_original_name = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses_recorded",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses_updated",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses_cancelled",
    )
    cancellation_reason = models.CharField(max_length=1000, blank=True)

    objects = ImmutableExpenseQuerySet.as_manager()

    class Meta:
        ordering = ("-expense_date", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="expenses_amount_positive",
            ),
            models.CheckConstraint(
                condition=(
                    Q(cancelled_at__isnull=True, cancellation_reason="")
                    | Q(cancelled_at__isnull=False)
                    & ~Q(cancellation_reason="")
                ),
                name="expenses_cancellation_state_consistent",
            ),
        ]
        indexes = [
            models.Index(
                fields=("expense_date", "cancelled_at"),
                name="expenses_date_cancelled_idx",
            ),
        ]

    def delete(self, *args, **kwargs):
        raise TypeError("Financial expenses cannot be deleted.")

    def __str__(self):
        return f"{self.category.name}: {self.amount} ({self.expense_date})"


class ImmutableExpenseHistoryQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise TypeError("Expense audit history is immutable.")

    def delete(self):
        raise TypeError("Expense audit history is immutable.")


class ExpenseHistory(UUIDTimeStampedModel):
    class EventType(models.TextChoices):
        CREATED = "CREATED", "Created"
        UPDATED = "UPDATED", "Updated"
        CANCELLED = "CANCELLED", "Cancelled"

    expense = models.ForeignKey(
        Expense,
        on_delete=models.PROTECT,
        related_name="audit_history",
    )
    event_type = models.CharField(max_length=12, choices=EventType.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expense_audit_events",
    )
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField()

    objects = ImmutableExpenseHistoryQuerySet.as_manager()

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(
                fields=("expense", "created_at"),
                name="expenses_history_event_idx",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Expense audit history is immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Expense audit history is immutable.")

    def __str__(self):
        return f"{self.event_type} expense {self.expense_id}"
