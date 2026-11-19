from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.workers.models import CommissionPayment, Worker, WorkerJob
from apps.workers.services import get_worker_outstanding_commission


class WorkerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Worker
        fields = (
            "id",
            "full_name",
            "phone_number",
            "address",
            "employment_date",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_full_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Enter the worker's full name.")
        return name

    def validate_phone_number(self, value):
        phone_number = value.strip()
        if not phone_number or not any(character.isdigit() for character in phone_number):
            raise serializers.ValidationError(
                "Enter a phone number containing at least one digit."
            )
        if any(character not in "+0123456789().- " for character in phone_number):
            raise serializers.ValidationError(
                "Use only digits, spaces, and common phone number punctuation."
            )
        return phone_number


class WorkerJobSerializer(serializers.ModelSerializer):
    worker = serializers.PrimaryKeyRelatedField(queryset=Worker.objects.all())
    worker_name = serializers.CharField(source="worker.full_name", read_only=True)
    vehicle_type_name = serializers.CharField(
        source="vehicle_type.name",
        read_only=True,
    )
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = WorkerJob
        fields = (
            "id",
            "worker",
            "worker_name",
            "vehicle_type",
            "vehicle_type_name",
            "service",
            "service_name",
            "status",
            "assigned_at",
            "completed_at",
            "service_price",
            "commission_percentage",
            "commission_amount",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "worker_name",
            "vehicle_type_name",
            "service_name",
            "status",
            "assigned_at",
            "completed_at",
            "service_price",
            "commission_percentage",
            "commission_amount",
            "created_at",
            "updated_at",
        )

    def validate_worker(self, worker):
        if not worker.is_active:
            raise serializers.ValidationError(
                "Inactive workers cannot be assigned to new jobs."
            )
        return worker

    def validate_vehicle_type(self, vehicle_type):
        if not vehicle_type.is_active:
            raise serializers.ValidationError(
                "Inactive vehicle types cannot be assigned to new jobs."
            )
        return vehicle_type

    def validate_service(self, service):
        if not service.is_active:
            raise serializers.ValidationError(
                "Inactive services cannot be assigned to new jobs."
            )
        return service


class CommissionPaymentSerializer(serializers.ModelSerializer):
    worker = serializers.PrimaryKeyRelatedField(read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    class Meta:
        model = CommissionPayment
        fields = (
            "id",
            "worker",
            "amount",
            "payment_date",
            "notes",
            "recorded_by_name",
            "created_at",
        )
        read_only_fields = ("id", "worker", "recorded_by_name", "created_at")

    def get_recorded_by_name(self, instance):
        if instance.recorded_by is None:
            return None
        return (
            instance.recorded_by.get_full_name().strip()
            or instance.recorded_by.username
        )

    def validate_payment_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Payment date cannot be in the future.")
        return value

    def validate(self, attrs):
        worker = self.context["worker"]
        amount = attrs["amount"]
        outstanding = get_worker_outstanding_commission(worker)
        if amount > outstanding:
            raise serializers.ValidationError(
                {
                    "amount": (
                        "Payment exceeds the outstanding commission of "
                        f"{outstanding:.2f}."
                    )
                }
            )
        return attrs
