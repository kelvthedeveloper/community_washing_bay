from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.configuration.models import InventoryCategory
from apps.inventory.models import (
    InventoryProduct,
    InventoryPurchase,
    InventoryPurchaseLine,
    StockMovement,
    Supplier,
)
from apps.inventory.services import (
    UNIT_COST_QUANTUM,
    get_average_unit_cost,
)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = (
            "id",
            "name",
            "contact_name",
            "phone_number",
            "email",
            "address",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        name = value.strip()
        matches = Supplier.objects.filter(name__iexact=name)
        if self.instance is not None:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError(
                "A supplier with this name already exists."
            )
        return name

    def validate_phone_number(self, value):
        return value.strip()


class InventoryProductSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(
        queryset=InventoryCategory.objects.all(),
    )
    category_name = serializers.CharField(source="category.name", read_only=True)
    stock_on_hand = serializers.SerializerMethodField()
    average_unit_cost = serializers.SerializerMethodField()
    stock_value = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = InventoryProduct
        fields = (
            "id",
            "name",
            "sku",
            "category",
            "category_name",
            "unit_label",
            "low_stock_threshold",
            "description",
            "is_active",
            "stock_on_hand",
            "average_unit_cost",
            "stock_value",
            "is_low_stock",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "category_name",
            "stock_on_hand",
            "average_unit_cost",
            "stock_value",
            "is_low_stock",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "low_stock_threshold": {
                "min_value": Decimal("0.000"),
            },
        }

    def get_stock_on_hand(self, instance) -> str:
        return format_quantity(getattr(instance, "stock_on_hand", Decimal("0.000")))

    def get_average_unit_cost(self, instance) -> str:
        quantity = getattr(instance, "stock_on_hand", Decimal("0.000"))
        value = getattr(instance, "stock_value", Decimal("0.00"))
        return format_cost(get_average_unit_cost(quantity, value))

    def get_stock_value(self, instance) -> str:
        value = getattr(instance, "stock_value", Decimal("0.00"))
        return format_money(value)

    def get_is_low_stock(self, instance) -> bool:
        quantity = getattr(instance, "stock_on_hand", Decimal("0.000"))
        return quantity <= instance.low_stock_threshold

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Enter an inventory item name.")
        return name

    def validate_sku(self, value):
        sku = value.strip()
        if not sku:
            return ""
        matches = InventoryProduct.objects.filter(sku__iexact=sku)
        if self.instance is not None:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("This SKU is already in use.")
        return sku

    def validate_unit_label(self, value):
        unit = value.strip()
        if not unit:
            raise serializers.ValidationError("Enter a unit of measure.")
        return unit

    def validate(self, attrs):
        category = attrs.get("category")
        if category is not None and not category.is_active:
            if self.instance is None or category.pk != self.instance.category_id:
                raise serializers.ValidationError(
                    {"category": "Inactive categories cannot be assigned to items."}
                )
        if (
            self.instance is not None
            and "unit_label" in attrs
            and attrs["unit_label"] != self.instance.unit_label
            and self.instance.movements.exists()
        ):
            raise serializers.ValidationError(
                {
                    "unit_label": (
                        "The unit of measure cannot change after stock movements "
                        "have been recorded."
                    )
                }
            )
        return attrs


class InventoryPurchaseLineInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=InventoryProduct.objects.all(),
    )
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    unit_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )


class InventoryPurchaseWriteSerializer(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    purchase_date = serializers.DateField(default=timezone.localdate)
    invoice_number = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
    )
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    lines = InventoryPurchaseLineInputSerializer(many=True, min_length=1)

    def validate_purchase_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Purchase date cannot be in the future.")
        return value

    def validate(self, attrs):
        if not attrs["supplier"].is_active:
            raise serializers.ValidationError(
                {"supplier": "Inactive suppliers cannot be used for new purchases."}
            )
        product_ids = [line["product"].pk for line in attrs["lines"]]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError(
                {"lines": "Each product may only appear once per purchase."}
            )
        if any(not line["product"].is_active for line in attrs["lines"]):
            raise serializers.ValidationError(
                {"lines": "Inactive products cannot be used for new purchases."}
            )
        return attrs


class InventoryPurchaseLineReadSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit_label = serializers.CharField(source="product.unit_label", read_only=True)

    class Meta:
        model = InventoryPurchaseLine
        fields = (
            "id",
            "product",
            "product_name",
            "unit_label",
            "quantity",
            "unit_cost",
            "total_cost",
        )
        read_only_fields = fields


class InventoryPurchaseReadSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    lines = InventoryPurchaseLineReadSerializer(many=True, read_only=True)

    class Meta:
        model = InventoryPurchase
        fields = (
            "id",
            "supplier",
            "supplier_name",
            "purchase_date",
            "invoice_number",
            "total_cost",
            "notes",
            "recorded_by",
            "recorded_by_name",
            "lines",
            "created_at",
        )
        read_only_fields = fields

    def get_recorded_by_name(self, instance) -> str | None:
        if instance.recorded_by is None:
            return None
        return (
            instance.recorded_by.get_full_name().strip()
            or instance.recorded_by.username
        )


class InventoryUsageSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    reason = serializers.CharField(max_length=1000, trim_whitespace=True)
    occurred_at = serializers.DateTimeField(required=False)

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("Describe how the stock was used.")
        return value.strip()

    def validate_occurred_at(self, value):
        if value > timezone.now():
            raise serializers.ValidationError("Movement time cannot be in the future.")
        return value


class InventoryAdjustmentSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
    )
    unit_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    reason = serializers.CharField(max_length=1000, trim_whitespace=True)
    occurred_at = serializers.DateTimeField(required=False)

    def validate_quantity(self, value):
        if value == Decimal("0.000"):
            raise serializers.ValidationError("Adjustment quantity cannot be zero.")
        return value

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("A reason is required for an adjustment.")
        return value.strip()

    def validate_occurred_at(self, value):
        if value > timezone.now():
            raise serializers.ValidationError("Movement time cannot be in the future.")
        return value

    def validate(self, attrs):
        if attrs["quantity"] < 0 and attrs.get("unit_cost") is not None:
            raise serializers.ValidationError(
                {"unit_cost": "Negative adjustments use the current weighted average."}
            )
        return attrs


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit_label = serializers.CharField(source="product.unit_label", read_only=True)
    supplier_name = serializers.CharField(
        source="purchase.supplier.name",
        read_only=True,
        default=None,
    )
    invoice_number = serializers.CharField(
        source="purchase.invoice_number",
        read_only=True,
        default=None,
    )
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = (
            "id",
            "product",
            "product_name",
            "unit_label",
            "movement_type",
            "quantity",
            "unit_cost_snapshot",
            "value_change",
            "purchase",
            "supplier_name",
            "invoice_number",
            "occurred_at",
            "reason",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        )
        read_only_fields = fields

    def get_recorded_by_name(self, instance) -> str | None:
        if instance.recorded_by is None:
            return None
        return (
            instance.recorded_by.get_full_name().strip()
            or instance.recorded_by.username
        )


class InventoryValuationItemSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    name = serializers.CharField()
    sku = serializers.CharField()
    category = serializers.CharField()
    unit_label = serializers.CharField()
    is_active = serializers.BooleanField()
    quantity_on_hand = serializers.CharField()
    average_unit_cost = serializers.CharField()
    stock_value = serializers.CharField()
    is_low_stock = serializers.BooleanField()


class InventoryValuationReportSerializer(serializers.Serializer):
    as_of = serializers.DateField()
    total_stock_value = serializers.CharField()
    low_stock_count = serializers.IntegerField()
    items = InventoryValuationItemSerializer(many=True)


class InventoryMovementReportItemSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    name = serializers.CharField()
    unit_label = serializers.CharField()
    purchased_quantity = serializers.CharField()
    purchase_cost = serializers.CharField()
    used_quantity = serializers.CharField()
    usage_cost = serializers.CharField()
    adjustment_quantity = serializers.CharField()
    movement_count = serializers.IntegerField()


class InventoryMovementReportSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    movement_count = serializers.IntegerField()
    total_purchase_cost = serializers.CharField()
    total_usage_cost = serializers.CharField()
    items = InventoryMovementReportItemSerializer(many=True)


def format_quantity(value):
    return f"{value.quantize(Decimal('0.001')):.3f}"


def format_cost(value):
    return f"{value.quantize(UNIT_COST_QUANTUM):.6f}"


def format_money(value):
    return f"{value.quantize(Decimal('0.01')):.2f}"
