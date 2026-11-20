from decimal import Decimal
from uuid import UUID

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework import serializers

from apps.configuration.models import Service, VehicleType
from apps.jobs.models import (
    Job,
    JobPayment,
    JobRefund,
    JobService,
    JobWorkerAssignment,
    Vehicle,
)
from apps.jobs.services import (
    build_refund_fingerprint,
    build_sale_fingerprint,
    record_job_refund,
    register_job,
    register_pos_sale,
)
from apps.users.models import User
from apps.workers.models import Worker


class JobServiceSnapshotSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = JobService
        fields = (
            "service",
            "service_name",
            "price_snapshot",
            "discount_amount",
            "commissionable_amount",
            "commission_rate_snapshot",
            "commission_amount",
        )
        read_only_fields = fields


class JobWorkerAssignmentSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source="worker.full_name", read_only=True)

    class Meta:
        model = JobWorkerAssignment
        fields = ("worker", "worker_name", "commission_amount")
        read_only_fields = fields


class JobReadSerializer(serializers.ModelSerializer):
    vehicle_number_plate = serializers.CharField(
        source="vehicle.number_plate",
        read_only=True,
        allow_null=True,
    )
    vehicle_type_name = serializers.CharField(
        source="vehicle_type.name",
        read_only=True,
    )
    services = JobServiceSnapshotSerializer(
        source="job_services",
        many=True,
        read_only=True,
    )
    assigned_workers = JobWorkerAssignmentSerializer(
        source="worker_assignments",
        many=True,
        read_only=True,
    )
    amount_due = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    payment_status = serializers.CharField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    discount_applied_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = (
            "id",
            "vehicle",
            "vehicle_number_plate",
            "number_plate",
            "vehicle_type",
            "vehicle_type_name",
            "services",
            "assigned_workers",
            "job_date",
            "status",
            "registered_at",
            "washing_started_at",
            "completed_at",
            "cancelled_at",
            "total_price",
            "subtotal",
            "discount_type",
            "discount_value",
            "discount_amount",
            "discount_applied_by",
            "discount_applied_by_name",
            "commission_amount",
            "amount_paid",
            "amount_due",
            "payment_status",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_created_by_name(self, instance: Job) -> str | None:
        return user_display_name(instance.created_by)

    def get_updated_by_name(self, instance: Job) -> str | None:
        return user_display_name(instance.updated_by)

    def get_discount_applied_by_name(self, instance: Job) -> str | None:
        return user_display_name(instance.discount_applied_by)


class JobCreateSerializer(serializers.ModelSerializer):
    vehicle_type = serializers.PrimaryKeyRelatedField(
        queryset=VehicleType.objects.all()
    )
    workers = serializers.PrimaryKeyRelatedField(
        queryset=Worker.objects.all(),
        many=True,
        write_only=True,
    )
    services = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(),
        many=True,
        write_only=True,
    )

    class Meta:
        model = Job
        fields = ("number_plate", "vehicle_type", "workers", "services")

    def validate_number_plate(self, value):
        plate = value.strip().upper()
        if not plate:
            raise serializers.ValidationError("Enter a vehicle number plate.")
        return plate

    def validate_vehicle_type(self, vehicle_type):
        if not vehicle_type.is_active:
            raise serializers.ValidationError(
                "Inactive vehicle types cannot be used for new jobs."
            )
        return vehicle_type

    def validate_workers(self, workers):
        if not workers:
            raise serializers.ValidationError("Assign at least one worker.")
        worker_ids = [worker.pk for worker in workers]
        if len(set(worker_ids)) != len(worker_ids):
            raise serializers.ValidationError("A worker can only be assigned once.")
        if any(not worker.is_active for worker in workers):
            raise serializers.ValidationError(
                "Inactive workers cannot be assigned to new jobs."
            )
        return workers

    def validate_services(self, services):
        if not services:
            raise serializers.ValidationError("Select at least one service.")
        service_ids = [service.pk for service in services]
        if len(set(service_ids)) != len(service_ids):
            raise serializers.ValidationError("A service can only be selected once.")
        if any(not service.is_active for service in services):
            raise serializers.ValidationError(
                "Inactive services cannot be added to new jobs."
            )
        return services

    def create(self, validated_data):
        return register_job(
            number_plate=validated_data["number_plate"],
            vehicle_type=validated_data["vehicle_type"],
            workers=validated_data["workers"],
            services=validated_data["services"],
            actor=self.context["request"].user,
        )


class VehicleSerializer(serializers.ModelSerializer):
    vehicle_type_name = serializers.CharField(
        source="vehicle_type.name",
        read_only=True,
    )

    class Meta:
        model = Vehicle
        fields = (
            "id",
            "number_plate",
            "vehicle_type",
            "vehicle_type_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class InitialPaymentInputSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )
    method = serializers.ChoiceField(
        choices=JobPayment.Method.choices,
        required=False,
    )
    payment_date = serializers.DateField(default=timezone.localdate)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["amount"] > Decimal("0.00") and not attrs.get("method"):
            raise serializers.ValidationError(
                {"method": "Select a payment method for a payment above zero."}
            )
        if attrs["payment_date"] > timezone.localdate():
            raise serializers.ValidationError(
                {"payment_date": "Payment date cannot be in the future."}
            )
        return attrs


class PosSaleSerializer(JobCreateSerializer):
    discount_type = serializers.ChoiceField(
        choices=Job.DiscountType.choices,
        default=Job.DiscountType.NONE,
    )
    discount_value = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )
    initial_payment = InitialPaymentInputSerializer(required=False)

    class Meta(JobCreateSerializer.Meta):
        fields = JobCreateSerializer.Meta.fields + (
            "discount_type",
            "discount_value",
            "initial_payment",
        )

    def validate(self, attrs):
        discount_type = attrs["discount_type"]
        discount_value = attrs["discount_value"]
        if discount_type == Job.DiscountType.NONE and discount_value:
            raise serializers.ValidationError(
                {"discount_value": "Choose a discount type or enter zero."}
            )
        if discount_type == Job.DiscountType.PERCENTAGE and discount_value > 100:
            raise serializers.ValidationError(
                {"discount_value": "Percentage discount cannot exceed 100."}
            )
        user = self.context["request"].user
        if discount_type != Job.DiscountType.NONE and not (
            user.has_unrestricted_access or user.role == User.Role.ADMIN
        ):
            raise PermissionDenied(
                "Only Admin and Super Admin users can apply discounts."
            )
        return attrs

    def create(self, validated_data):
        initial_payment = validated_data.pop(
            "initial_payment",
            {
                "amount": Decimal("0.00"),
                "payment_date": timezone.localdate(),
                "notes": "",
            },
        )
        values = {
            "number_plate": validated_data["number_plate"],
            "vehicle_type": validated_data["vehicle_type"],
            "workers": validated_data["workers"],
            "services": validated_data["services"],
            "discount_type": validated_data["discount_type"],
            "discount_value": validated_data["discount_value"],
            "initial_payment": initial_payment,
        }
        request_fingerprint = build_sale_fingerprint(**values)
        job, replayed = register_pos_sale(
            **values,
            actor=self.context["request"].user,
            idempotency_key=self.context["idempotency_key"],
            request_fingerprint=request_fingerprint,
        )
        self.context["idempotent_replay"] = replayed
        return job


class JobQuoteQuerySerializer(serializers.Serializer):
    vehicle_type = serializers.UUIDField()
    services = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
    )
    discount_type = serializers.ChoiceField(
        choices=Job.DiscountType.choices,
        default=Job.DiscountType.NONE,
    )
    discount_value = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )

    def validate(self, attrs):
        discount_type = attrs["discount_type"]
        discount_value = attrs["discount_value"]
        if discount_type == Job.DiscountType.NONE and discount_value:
            raise serializers.ValidationError(
                {"discount_value": "Choose a discount type or enter zero."}
            )
        if discount_type == Job.DiscountType.PERCENTAGE and discount_value > 100:
            raise serializers.ValidationError(
                {"discount_value": "Percentage discount cannot exceed 100."}
            )
        request = self.context.get("request")
        if discount_type != Job.DiscountType.NONE and request is not None:
            user = request.user
            if not (user.has_unrestricted_access or user.role == User.Role.ADMIN):
                raise PermissionDenied(
                    "Only Admin and Super Admin users can apply discounts."
                )
        return attrs

    def validate_services(self, services):
        if len(set(services)) != len(services):
            raise serializers.ValidationError(
                "A service can only be selected once."
            )
        return services


class JobPaymentSerializer(serializers.ModelSerializer):
    job = serializers.PrimaryKeyRelatedField(read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    method = serializers.ChoiceField(choices=JobPayment.Method.choices)

    class Meta:
        model = JobPayment
        fields = (
            "id",
            "job",
            "amount",
            "method",
            "payment_date",
            "notes",
            "recorded_by_name",
        )
        read_only_fields = ("id", "job", "recorded_by_name")

    def validate_payment_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Payment date cannot be in the future.")
        return value

    def get_recorded_by_name(self, instance):
        return user_display_name(instance.recorded_by)


class JobRefundWriteSerializer(serializers.Serializer):
    payment = serializers.PrimaryKeyRelatedField(
        queryset=JobPayment.objects.all(),
    )
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    refund_date = serializers.DateField(default=timezone.localdate)
    reason = serializers.CharField(max_length=1000, trim_whitespace=True)

    def validate_refund_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Refund date cannot be in the future.")
        return value

    def validate_reason(self, value):
        if not value:
            raise serializers.ValidationError("Enter a reason for the refund.")
        return value


class JobRefundReadSerializer(serializers.ModelSerializer):
    job = serializers.UUIDField(source="payment.job_id", read_only=True)
    payment = serializers.UUIDField(read_only=True)
    method = serializers.CharField(source="payment.method", read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = JobRefund
        fields = (
            "id",
            "job",
            "payment",
            "amount",
            "method",
            "refund_date",
            "reason",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        )
        read_only_fields = fields

    def get_recorded_by_name(self, instance):
        return user_display_name(instance.recorded_by)


class JobReceiptSerializer(serializers.Serializer):
    receipt_number = serializers.CharField()
    issued_at = serializers.DateTimeField()
    job = JobReadSerializer()
    payments = JobPaymentSerializer(many=True)
    refunds = JobRefundReadSerializer(many=True)


def parse_idempotency_key(value):
    try:
        return UUID(value)
    except (TypeError, ValueError, AttributeError) as error:
        raise serializers.ValidationError(
            {"Idempotency-Key": "Provide a valid UUID in the Idempotency-Key header."}
        ) from error


def user_display_name(user) -> str | None:
    if user is None:
        return None
    return user.get_full_name().strip() or user.username
