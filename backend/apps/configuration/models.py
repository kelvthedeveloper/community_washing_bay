from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.core.models import UUIDTimeStampedModel


class ActiveConfigurationModel(UUIDTimeStampedModel):
    is_active = models.BooleanField(default=True)

    def deactivate(self):
        if self.is_active:
            self.is_active = False
            self.save(update_fields={"is_active", "updated_at"})

    class Meta:
        abstract = True


class NamedConfiguration(ActiveConfigurationModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

    class Meta:
        abstract = True


class VehicleType(NamedConfiguration):
    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="cfg_vehicle_type_name_ci_uniq",
            ),
        ]
        ordering = ("name",)


class Service(NamedConfiguration):
    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="cfg_service_name_ci_uniq",
            ),
        ]
        ordering = ("name",)


class ServicePricing(ActiveConfigurationModel):
    vehicle_type = models.ForeignKey(
        VehicleType,
        on_delete=models.PROTECT,
        related_name="service_pricing",
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name="vehicle_pricing",
    )
    price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    effective_date = models.DateField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("vehicle_type", "service", "effective_date"),
                name="cfg_pricing_vehicle_service_date_uniq",
            ),
            models.CheckConstraint(
                condition=Q(price__gte=0),
                name="cfg_pricing_price_nonnegative",
            ),
        ]
        ordering = ("-effective_date", "-created_at")

    def __str__(self):
        return (
            f"{self.service} / {self.vehicle_type} "
            f"({self.effective_date.isoformat()})"
        )


class CommissionSetting(ActiveConfigurationModel):
    class AllocationPolicy(models.TextChoices):
        EQUAL_SPLIT = "EQUAL_SPLIT", "Equal split"

    commission_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[
            MinValueValidator(Decimal("0.00")),
            MaxValueValidator(Decimal("100.00")),
        ],
    )
    effective_date = models.DateField()
    allocation_policy = models.CharField(
        max_length=20,
        choices=AllocationPolicy.choices,
        default=AllocationPolicy.EQUAL_SPLIT,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("effective_date",),
                name="cfg_commission_effective_date_uniq",
            ),
            models.CheckConstraint(
                condition=Q(commission_percentage__gte=0)
                & Q(commission_percentage__lte=100),
                name="cfg_commission_percentage_range",
            ),
        ]
        ordering = ("-effective_date", "-created_at")

    def __str__(self):
        return f"Commission setting ({self.effective_date.isoformat()})"


class ExpenseCategory(NamedConfiguration):
    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="cfg_expense_category_name_ci_uniq",
            ),
        ]
        ordering = ("name",)


class InventoryCategory(NamedConfiguration):
    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="cfg_inventory_category_name_ci_uniq",
            ),
        ]
        ordering = ("name",)
