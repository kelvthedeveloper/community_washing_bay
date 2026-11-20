from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.workers.models import CommissionLedgerEntry, CommissionPayment, Worker
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
        available = max(outstanding, Decimal("0.00"))
        if amount > available:
            raise serializers.ValidationError(
                {
                    "amount": (
                        "Payment exceeds the outstanding commission of "
                        f"{available:.2f}."
                    )
                }
            )
        return attrs


class CommissionLedgerEntrySerializer(serializers.ModelSerializer):
    is_reversed = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CommissionLedgerEntry
        fields = (
            "id",
            "worker",
            "job",
            "assignment",
            "source_entry",
            "is_reversed",
            "entry_type",
            "amount",
            "effective_date",
            "reason",
            "commission_base_snapshot",
            "commission_rate_snapshot",
            "allocation_policy_snapshot",
            "allocation_worker_count_snapshot",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        )
        read_only_fields = fields

    def get_is_reversed(self, instance):
        return any(
            entry.entry_type == CommissionLedgerEntry.EntryType.REVERSAL
            for entry in instance.reversal_entries.all()
        )

    def get_recorded_by_name(self, instance):
        if instance.recorded_by is None:
            return None
        return (
            instance.recorded_by.get_full_name().strip()
            or instance.recorded_by.username
        )


class CommissionLedgerMutationSerializer(serializers.Serializer):
    entry_type = serializers.ChoiceField(
        choices=(
            CommissionLedgerEntry.EntryType.ADJUSTMENT,
            CommissionLedgerEntry.EntryType.REVERSAL,
        )
    )
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
    )
    source_entry = serializers.PrimaryKeyRelatedField(
        queryset=CommissionLedgerEntry.objects.all(),
        required=False,
    )
    effective_date = serializers.DateField(required=False)
    reason = serializers.CharField(max_length=10000, trim_whitespace=True)

    def validate_effective_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Effective date cannot be in the future.")
        return value

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("A reason is required.")
        return value.strip()

    def validate(self, attrs):
        entry_type = attrs["entry_type"]
        amount = attrs.get("amount")
        source_entry = attrs.get("source_entry")
        worker = self.context["worker"]

        if entry_type == CommissionLedgerEntry.EntryType.ADJUSTMENT:
            if amount is None or amount == Decimal("0.00"):
                raise serializers.ValidationError(
                    {"amount": "An adjustment must be a non-zero signed amount."}
                )
            if source_entry is not None and source_entry.worker_id != worker.pk:
                raise serializers.ValidationError(
                    {"source_entry": "The source entry must belong to this worker."}
                )
            if source_entry is not None and (
                source_entry.entry_type == CommissionLedgerEntry.EntryType.REVERSAL
            ):
                raise serializers.ValidationError(
                    {"source_entry": "A reversal cannot be adjusted directly."}
                )
        else:
            if source_entry is None:
                raise serializers.ValidationError(
                    {"source_entry": "Select the entry to reverse."}
                )
            if amount is not None:
                raise serializers.ValidationError(
                    {"amount": "A reversal amount is determined by its source entry."}
                )
            if source_entry.worker_id != worker.pk:
                raise serializers.ValidationError(
                    {"source_entry": "The source entry must belong to this worker."}
                )
            if source_entry.entry_type == CommissionLedgerEntry.EntryType.REVERSAL:
                raise serializers.ValidationError(
                    {"source_entry": "A reversal cannot itself be reversed."}
                )
            if source_entry.reversal_entries.filter(
                entry_type=CommissionLedgerEntry.EntryType.REVERSAL
            ).exists():
                raise serializers.ValidationError(
                    {"source_entry": "This entry has already been reversed."}
                )
        return attrs
