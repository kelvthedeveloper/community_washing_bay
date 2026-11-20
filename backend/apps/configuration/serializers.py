from decimal import Decimal

from rest_framework import serializers

from apps.configuration.models import (
    CommissionSetting,
    ExpenseCategory,
    InventoryCategory,
    Service,
    ServicePricing,
    VehicleType,
)


class NamedConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        name = value.strip()
        matching_names = self.Meta.model.objects.filter(name__iexact=name)
        if self.instance is not None:
            matching_names = matching_names.exclude(pk=self.instance.pk)
        if matching_names.exists():
            raise serializers.ValidationError(
                "A configuration record with this name already exists."
            )
        return name


class VehicleTypeSerializer(NamedConfigurationSerializer):
    class Meta(NamedConfigurationSerializer.Meta):
        model = VehicleType


class ServiceSerializer(NamedConfigurationSerializer):
    class Meta(NamedConfigurationSerializer.Meta):
        model = Service


class ExpenseCategorySerializer(NamedConfigurationSerializer):
    class Meta(NamedConfigurationSerializer.Meta):
        model = ExpenseCategory


class InventoryCategorySerializer(NamedConfigurationSerializer):
    class Meta(NamedConfigurationSerializer.Meta):
        model = InventoryCategory


class ServicePricingSerializer(serializers.ModelSerializer):
    vehicle_type = serializers.PrimaryKeyRelatedField(
        queryset=VehicleType.objects.all(),
    )
    vehicle_type_name = serializers.CharField(
        source="vehicle_type.name",
        read_only=True,
    )
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all())
    service_name = serializers.CharField(source="service.name", read_only=True)
    price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )

    class Meta:
        model = ServicePricing
        fields = (
            "id",
            "vehicle_type",
            "vehicle_type_name",
            "service",
            "service_name",
            "price",
            "effective_date",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "vehicle_type_name",
            "service_name",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        immutable_fields = ("vehicle_type", "service", "price", "effective_date")
        if self.instance is not None:
            if any(
                field in attrs and attrs[field] != getattr(self.instance, field)
                for field in immutable_fields
            ):
                raise serializers.ValidationError(
                    "Pricing history is immutable. Create a new record with an "
                    "effective date to change pricing."
                )
            return attrs

        vehicle_type = attrs["vehicle_type"]
        service = attrs["service"]
        if not vehicle_type.is_active:
            raise serializers.ValidationError(
                {"vehicle_type": "Inactive vehicle types cannot be priced."}
            )
        if not service.is_active:
            raise serializers.ValidationError(
                {"service": "Inactive services cannot be priced."}
            )
        if ServicePricing.objects.filter(
            vehicle_type=vehicle_type,
            service=service,
            effective_date=attrs["effective_date"],
        ).exists():
            raise serializers.ValidationError(
                "A pricing record already exists for this vehicle type, service, "
                "and effective date."
            )
        return attrs


class CommissionSettingSerializer(serializers.ModelSerializer):
    commission_percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.00"),
        max_value=Decimal("100.00"),
    )

    class Meta:
        model = CommissionSetting
        fields = (
            "id",
            "commission_percentage",
            "effective_date",
            "allocation_policy",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "allocation_policy",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        if self.instance is not None:
            immutable_fields = ("commission_percentage", "effective_date")
            if any(
                field in attrs and attrs[field] != getattr(self.instance, field)
                for field in immutable_fields
            ):
                raise serializers.ValidationError(
                    "Commission history is immutable. Create a new record with an "
                    "effective date to change the commission setting."
                )
            return attrs

        if CommissionSetting.objects.filter(
            effective_date=attrs["effective_date"]
        ).exists():
            raise serializers.ValidationError(
                "A commission setting already exists for this effective date."
            )
        return attrs
