from pathlib import PurePosixPath
from decimal import Decimal

from rest_framework import serializers

from apps.configuration.models import ExpenseCategory
from apps.expenses.models import Expense, ExpenseHistory


MAX_RECEIPT_BYTES = 10 * 1024 * 1024
RECEIPT_SIGNATURES = {
    ".pdf": (lambda content: content.startswith(b"%PDF-")),
    ".png": (lambda content: content.startswith(b"\x89PNG\r\n\x1a\n")),
    ".jpg": (lambda content: content.startswith(b"\xff\xd8\xff")),
    ".jpeg": (lambda content: content.startswith(b"\xff\xd8\xff")),
    ".webp": (lambda content: content.startswith(b"RIFF") and content[8:12] == b"WEBP"),
}


class ExpenseWriteSerializer(serializers.Serializer):
    category = serializers.PrimaryKeyRelatedField(
        queryset=ExpenseCategory.objects.all(),
    )
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    description = serializers.CharField(max_length=4000, trim_whitespace=True)
    expense_date = serializers.DateField()
    payment_method = serializers.ChoiceField(choices=Expense.PaymentMethod.choices)
    receipt = serializers.FileField(
        required=False,
        allow_empty_file=False,
        write_only=True,
    )

    def validate_category(self, category):
        if not category.is_active:
            current_category_id = (
                self.instance.category_id if self.instance is not None else None
            )
            if category.pk != current_category_id:
                raise serializers.ValidationError(
                    "Inactive expense categories cannot be assigned."
                )
        return category

    def validate_description(self, value):
        if not value:
            raise serializers.ValidationError("Enter an expense description.")
        return value

    def validate_receipt(self, receipt):
        if receipt.size > MAX_RECEIPT_BYTES:
            raise serializers.ValidationError("Receipt files must be 10 MB or smaller.")
        extension = PurePosixPath(receipt.name.replace("\\", "/")).suffix.lower()
        signature_check = RECEIPT_SIGNATURES.get(extension)
        if signature_check is None:
            raise serializers.ValidationError(
                "Use a PDF, PNG, JPEG, or WebP receipt file."
            )
        content = receipt.read(12)
        receipt.seek(0)
        if not signature_check(content):
            raise serializers.ValidationError(
                "The receipt file does not match its file type."
            )
        if self.instance is not None and self.instance.receipt:
            raise serializers.ValidationError(
                "A receipt is already attached and cannot be replaced."
            )
        return receipt

    def validate(self, attrs):
        category = attrs.get(
            "category",
            self.instance.category if self.instance is not None else None,
        )
        if category is not None and not category.is_active:
            if (
                self.instance is None
                or category.pk != self.instance.category_id
            ):
                raise serializers.ValidationError(
                    {"category": "Inactive expense categories cannot be assigned."}
                )
        return attrs


class ExpenseReadSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()
    has_receipt = serializers.SerializerMethodField()
    receipt_name = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = (
            "id",
            "category",
            "category_name",
            "amount",
            "description",
            "expense_date",
            "payment_method",
            "recorded_by",
            "recorded_by_name",
            "updated_by",
            "updated_by_name",
            "cancelled_at",
            "cancelled_by",
            "cancelled_by_name",
            "cancellation_reason",
            "has_receipt",
            "receipt_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_recorded_by_name(self, instance: Expense) -> str | None:
        return user_display_name(instance.recorded_by)

    def get_updated_by_name(self, instance: Expense) -> str | None:
        return user_display_name(instance.updated_by)

    def get_cancelled_by_name(self, instance: Expense) -> str | None:
        return user_display_name(instance.cancelled_by)

    def get_has_receipt(self, instance: Expense) -> bool:
        return bool(instance.receipt)

    def get_receipt_name(self, instance: Expense) -> str | None:
        return instance.receipt_original_name or None


class ExpenseCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, trim_whitespace=True)

    def validate_reason(self, value):
        if not value:
            raise serializers.ValidationError("Enter a reason for cancelling.")
        return value


class ExpenseHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseHistory
        fields = (
            "id",
            "event_type",
            "actor",
            "actor_name",
            "before",
            "after",
            "created_at",
        )
        read_only_fields = fields

    def get_actor_name(self, instance: ExpenseHistory) -> str | None:
        return user_display_name(instance.actor)


class ExpenseReportGroupSerializer(serializers.Serializer):
    category = serializers.UUIDField(required=False)
    category_name = serializers.CharField(required=False)
    payment_method = serializers.ChoiceField(
        choices=Expense.PaymentMethod.choices,
        required=False,
    )
    count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class ExpenseDailyReportSerializer(serializers.Serializer):
    date = serializers.DateField()
    expense_count = serializers.IntegerField()
    cancelled_count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    by_category = ExpenseReportGroupSerializer(many=True)
    by_payment_method = ExpenseReportGroupSerializer(many=True)


class ExpenseDailyTotalSerializer(serializers.Serializer):
    date = serializers.DateField(source="expense_date")
    count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class ExpenseMonthlyReportSerializer(serializers.Serializer):
    month = serializers.CharField()
    expense_count = serializers.IntegerField()
    cancelled_count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    by_category = ExpenseReportGroupSerializer(many=True)
    by_payment_method = ExpenseReportGroupSerializer(many=True)
    daily_totals = ExpenseDailyTotalSerializer(many=True)


def user_display_name(user):
    if user is None:
        return None
    return user.get_full_name().strip() or user.username
