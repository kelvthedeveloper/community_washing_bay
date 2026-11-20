from datetime import datetime, time
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers

from apps.inventory.models import (
    InventoryProduct,
    InventoryPurchase,
    InventoryPurchaseLine,
    StockMovement,
    Supplier,
)


ZERO_QUANTITY = Decimal("0.000")
ZERO_VALUE = Decimal("0.00")
CENT = Decimal("0.01")
UNIT_COST_QUANTUM = Decimal("0.000001")


def annotate_inventory_products(queryset):
    return queryset.annotate(
        stock_on_hand=Coalesce(
            Sum("movements__quantity"),
            Value(ZERO_QUANTITY),
            output_field=DecimalField(max_digits=14, decimal_places=3),
        ),
        stock_value=Coalesce(
            Sum("movements__value_change"),
            Value(ZERO_VALUE),
            output_field=DecimalField(max_digits=24, decimal_places=2),
        ),
    )


def get_stock_totals(product):
    totals = product.movements.aggregate(
        quantity=Sum("quantity"),
        value=Sum("value_change"),
    )
    return (
        totals["quantity"] or ZERO_QUANTITY,
        totals["value"] or ZERO_VALUE,
    )


def get_average_unit_cost(quantity, value):
    if quantity <= ZERO_QUANTITY:
        return Decimal("0.000000")
    return (value / quantity).quantize(
        UNIT_COST_QUANTUM,
        rounding=ROUND_HALF_UP,
    )


@transaction.atomic
def record_inventory_purchase(
    *,
    supplier,
    purchase_date,
    invoice_number,
    notes,
    lines,
    actor,
):
    locked_supplier = Supplier.objects.select_for_update().get(pk=supplier.pk)
    if not locked_supplier.is_active:
        raise serializers.ValidationError(
            {"supplier": "Inactive suppliers cannot be used for new purchases."}
        )

    product_ids = {line["product"].pk for line in lines}
    locked_products = {
        product.pk: product
        for product in InventoryProduct.objects.select_for_update()
        .filter(pk__in=product_ids)
        .order_by("pk")
    }
    if len(locked_products) != len(product_ids):
        raise serializers.ValidationError(
            {"lines": "One or more inventory products do not exist."}
        )
    if any(not product.is_active for product in locked_products.values()):
        raise serializers.ValidationError(
            {"lines": "Inactive products cannot be used for new purchases."}
        )

    prepared_lines = []
    total_cost = ZERO_VALUE
    for line in lines:
        product = locked_products[line["product"].pk]
        quantity = line["quantity"]
        unit_cost = line["unit_cost"]
        line_total = (quantity * unit_cost).quantize(
            CENT,
            rounding=ROUND_HALF_UP,
        )
        prepared_lines.append(
            {
                "product": product,
                "quantity": quantity,
                "unit_cost": unit_cost,
                "total_cost": line_total,
            }
        )
        total_cost += line_total

    purchase = InventoryPurchase.objects.create(
        supplier=locked_supplier,
        purchase_date=purchase_date,
        invoice_number=invoice_number,
        total_cost=total_cost,
        notes=notes,
        recorded_by=actor,
    )
    occurred_at = timezone.make_aware(
        datetime.combine(purchase_date, time.min),
        timezone.get_current_timezone(),
    )
    for line in prepared_lines:
        purchase_line = InventoryPurchaseLine.objects.create(
            purchase=purchase,
            product=line["product"],
            quantity=line["quantity"],
            unit_cost=line["unit_cost"],
            total_cost=line["total_cost"],
        )
        StockMovement.objects.create(
            product=line["product"],
            movement_type=StockMovement.Type.PURCHASE,
            quantity=line["quantity"],
            unit_cost_snapshot=line["unit_cost"],
            value_change=line["total_cost"],
            purchase=purchase,
            purchase_line=purchase_line,
            occurred_at=occurred_at,
            reason=(
                f"Purchase from {locked_supplier.name}"
                + (f" / {invoice_number}" if invoice_number else "")
            ),
            recorded_by=actor,
        )
    return purchase


@transaction.atomic
def record_inventory_usage(
    *,
    product_id,
    quantity,
    reason,
    actor,
    occurred_at=None,
):
    product = InventoryProduct.objects.select_for_update().get(pk=product_id)
    if not product.is_active:
        raise serializers.ValidationError(
            {"product": "Inactive products cannot be used."}
        )
    available, current_value = get_stock_totals(product)
    if quantity > available:
        raise serializers.ValidationError(
            {
                "quantity": (
                    f"Insufficient stock. Available: {available:.3f} "
                    f"{product.unit_label}."
                )
            }
        )
    if available <= ZERO_QUANTITY:
        raise serializers.ValidationError(
            {"quantity": "This product has no available stock."}
        )

    average_cost = get_average_unit_cost(available, current_value)
    value_change = _outbound_value_change(
        quantity=quantity,
        average_cost=average_cost,
        available=available,
        current_value=current_value,
    )
    unit_cost_snapshot = (
        (value_change / quantity).quantize(
            UNIT_COST_QUANTUM,
            rounding=ROUND_HALF_UP,
        )
        if quantity == available
        else average_cost
    )
    return StockMovement.objects.create(
        product=product,
        movement_type=StockMovement.Type.USAGE,
        quantity=-quantity,
        unit_cost_snapshot=unit_cost_snapshot,
        value_change=-value_change,
        occurred_at=occurred_at or timezone.now(),
        reason=reason,
        recorded_by=actor,
    )


@transaction.atomic
def record_inventory_adjustment(
    *,
    product_id,
    quantity,
    unit_cost,
    reason,
    actor,
    occurred_at=None,
):
    product = InventoryProduct.objects.select_for_update().get(pk=product_id)
    if not product.is_active:
        raise serializers.ValidationError(
            {"product": "Inactive products cannot be adjusted."}
        )
    available, current_value = get_stock_totals(product)
    absolute_quantity = abs(quantity)
    if quantity < ZERO_QUANTITY:
        if absolute_quantity > available:
            raise serializers.ValidationError(
                {
                    "quantity": (
                        f"Adjustment would reduce stock below zero. "
                        f"Available: {available:.3f} {product.unit_label}."
                    )
                }
            )
        average_cost = get_average_unit_cost(available, current_value)
        value_change = _outbound_value_change(
            quantity=absolute_quantity,
            average_cost=average_cost,
            available=available,
            current_value=current_value,
        )
        return StockMovement.objects.create(
            product=product,
            movement_type=StockMovement.Type.ADJUSTMENT,
            quantity=quantity,
            unit_cost_snapshot=(
                (value_change / absolute_quantity).quantize(
                    UNIT_COST_QUANTUM,
                    rounding=ROUND_HALF_UP,
                )
                if absolute_quantity == available
                else average_cost
            ),
            value_change=-value_change,
            occurred_at=occurred_at or timezone.now(),
            reason=reason,
            recorded_by=actor,
        )

    cost = unit_cost
    if cost is None:
        if available <= ZERO_QUANTITY:
            raise serializers.ValidationError(
                {"unit_cost": "Provide a unit cost when adding stock to an empty item."}
            )
        cost = get_average_unit_cost(available, current_value)
    value_change = (quantity * cost).quantize(CENT, rounding=ROUND_HALF_UP)
    return StockMovement.objects.create(
        product=product,
        movement_type=StockMovement.Type.ADJUSTMENT,
        quantity=quantity,
        unit_cost_snapshot=cost,
        value_change=value_change,
        occurred_at=occurred_at or timezone.now(),
        reason=reason,
        recorded_by=actor,
    )


def _outbound_value_change(*, quantity, average_cost, available, current_value):
    if quantity == available:
        return current_value
    return (quantity * average_cost).quantize(CENT, rounding=ROUND_HALF_UP)
