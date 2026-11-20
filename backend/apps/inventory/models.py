from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.models import UUIDTimeStampedModel


class Supplier(UUIDTimeStampedModel):
    name = models.CharField(max_length=150)
    contact_name = models.CharField(max_length=150, blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="inventory_supplier_name_ci_uniq",
            ),
        ]

    def __str__(self):
        return self.name


class InventoryProduct(UUIDTimeStampedModel):
    name = models.CharField(max_length=150)
    sku = models.CharField(max_length=64, blank=True, default="")
    category = models.ForeignKey(
        "configuration.InventoryCategory",
        on_delete=models.PROTECT,
        related_name="inventory_products",
    )
    unit_label = models.CharField(max_length=32)
    low_stock_threshold = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000"),
        validators=[MinValueValidator(Decimal("0.000"))],
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                Lower("sku"),
                condition=~Q(sku=""),
                name="inventory_product_sku_ci_uniq",
            ),
            models.CheckConstraint(
                condition=Q(low_stock_threshold__gte=0),
                name="inventory_product_low_stock_nonnegative",
            ),
        ]

    def __str__(self):
        return self.name


class InventoryPurchase(UUIDTimeStampedModel):
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchases",
    )
    purchase_date = models.DateField(default=timezone.localdate, db_index=True)
    invoice_number = models.CharField(max_length=100, blank=True)
    total_cost = models.DecimalField(
        max_digits=24,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_purchases_recorded",
    )

    class Meta:
        ordering = ("-purchase_date", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=Q(total_cost__gte=0),
                name="inventory_purchase_total_nonnegative",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Inventory purchase records are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Inventory purchase records are immutable.")

    def __str__(self):
        return f"Purchase {self.invoice_number or self.pk}"


class InventoryPurchaseLine(UUIDTimeStampedModel):
    purchase = models.ForeignKey(
        InventoryPurchase,
        on_delete=models.PROTECT,
        related_name="lines",
    )
    product = models.ForeignKey(
        InventoryProduct,
        on_delete=models.PROTECT,
        related_name="purchase_lines",
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    total_cost = models.DecimalField(
        max_digits=24,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("purchase", "product"),
                name="inventory_purchase_product_uniq",
            ),
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="inventory_purchase_line_quantity_positive",
            ),
            models.CheckConstraint(
                condition=Q(unit_cost__gte=0) & Q(total_cost__gte=0),
                name="inventory_purchase_line_cost_nonnegative",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Inventory purchase lines are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Inventory purchase lines are immutable.")

    def __str__(self):
        return f"{self.product} ({self.quantity})"


class ImmutableStockMovementQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise TypeError("Stock movement records are immutable.")

    def delete(self):
        raise TypeError("Stock movement records are immutable.")


class StockMovement(UUIDTimeStampedModel):
    class Type(models.TextChoices):
        PURCHASE = "PURCHASE", "Purchase"
        USAGE = "USAGE", "Usage"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"

    objects = ImmutableStockMovementQuerySet.as_manager()

    product = models.ForeignKey(
        InventoryProduct,
        on_delete=models.PROTECT,
        related_name="movements",
    )
    movement_type = models.CharField(max_length=12, choices=Type.choices)
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost_snapshot = models.DecimalField(max_digits=16, decimal_places=6)
    value_change = models.DecimalField(max_digits=24, decimal_places=2)
    purchase = models.ForeignKey(
        InventoryPurchase,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="movements",
    )
    purchase_line = models.OneToOneField(
        InventoryPurchaseLine,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="movement",
    )
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    reason = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements_recorded",
    )

    class Meta:
        ordering = ("-occurred_at", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(
                        movement_type="PURCHASE",
                        quantity__gt=0,
                        value_change__gte=0,
                        purchase__isnull=False,
                        purchase_line__isnull=False,
                    )
                    | Q(
                        movement_type="USAGE",
                        quantity__lt=0,
                        value_change__lte=0,
                        purchase__isnull=True,
                        purchase_line__isnull=True,
                    )
                    | Q(
                        movement_type="ADJUSTMENT",
                        quantity__gt=0,
                        value_change__gte=0,
                        purchase__isnull=True,
                        purchase_line__isnull=True,
                    )
                    | Q(
                        movement_type="ADJUSTMENT",
                        quantity__lt=0,
                        value_change__lte=0,
                        purchase__isnull=True,
                        purchase_line__isnull=True,
                    )
                ),
                name="inventory_movement_values_consistent",
            ),
            models.CheckConstraint(
                condition=Q(unit_cost_snapshot__gte=0),
                name="inventory_movement_unit_cost_nonnegative",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise TypeError("Stock movement records are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Stock movement records are immutable.")

    def __str__(self):
        return f"{self.product} {self.movement_type.lower()} ({self.quantity})"
