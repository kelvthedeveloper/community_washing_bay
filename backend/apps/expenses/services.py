from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from pathlib import PurePosixPath

from apps.expenses.models import Expense, ExpenseHistory


def expense_snapshot(expense):
    return {
        "category": str(expense.category_id),
        "category_name": expense.category.name,
        "amount": f"{expense.amount:.2f}",
        "description": expense.description,
        "expense_date": expense.expense_date.isoformat(),
        "payment_method": expense.payment_method,
        "receipt_name": expense.receipt_original_name or None,
        "cancelled_at": (
            expense.cancelled_at.isoformat() if expense.cancelled_at else None
        ),
        "cancellation_reason": expense.cancellation_reason,
    }


@transaction.atomic
def create_expense(*, actor, values):
    values = dict(values)
    if values.get("receipt"):
        values["receipt_original_name"] = PurePosixPath(
            values["receipt"].name.replace("\\", "/")
        ).name[:255]
    expense = Expense.objects.create(
        **values,
        recorded_by=actor,
        updated_by=actor,
    )
    ExpenseHistory.objects.create(
        expense=expense,
        event_type=ExpenseHistory.EventType.CREATED,
        actor=actor,
        after=expense_snapshot(expense),
    )
    return expense


@transaction.atomic
def update_expense(*, expense_id, actor, values):
    expense = Expense.objects.select_for_update().select_related("category").get(
        pk=expense_id
    )
    if expense.cancelled_at is not None:
        raise serializers.ValidationError(
            {"expense": "Cancelled expenses cannot be edited."}
        )
    if values.get("receipt") and expense.receipt:
        raise serializers.ValidationError(
            {"receipt": "A receipt is already attached and cannot be replaced."}
        )

    before = expense_snapshot(expense)
    values = dict(values)
    if values.get("receipt"):
        values["receipt_original_name"] = PurePosixPath(
            values["receipt"].name.replace("\\", "/")
        ).name[:255]
    for field, value in values.items():
        setattr(expense, field, value)
    expense.updated_by = actor
    expense.save()
    expense.refresh_from_db()
    expense = Expense.objects.select_related("category").get(pk=expense.pk)
    ExpenseHistory.objects.create(
        expense=expense,
        event_type=ExpenseHistory.EventType.UPDATED,
        actor=actor,
        before=before,
        after=expense_snapshot(expense),
    )
    return expense


@transaction.atomic
def cancel_expense(*, expense_id, actor, reason):
    expense = Expense.objects.select_for_update().select_related("category").get(
        pk=expense_id
    )
    if expense.cancelled_at is not None:
        raise serializers.ValidationError(
            {"expense": "This expense has already been cancelled."}
        )

    before = expense_snapshot(expense)
    expense.cancelled_at = timezone.now()
    expense.cancelled_by = actor
    expense.cancellation_reason = reason
    expense.updated_by = actor
    expense.save()
    ExpenseHistory.objects.create(
        expense=expense,
        event_type=ExpenseHistory.EventType.CANCELLED,
        actor=actor,
        before=before,
        after=expense_snapshot(expense),
    )
    return expense
