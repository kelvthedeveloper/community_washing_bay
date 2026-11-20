from rest_framework import serializers

class ReportQuerySerializer(serializers.Serializer):
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    group_by = serializers.ChoiceField(
        choices=("daily", "weekly", "monthly"),
        default="monthly",
    )

    def validate(self, attrs):
        today = self.context.get("today")
        end_date = attrs.get("end_date", today)
        start_date = attrs.get("start_date")
        if start_date is None:
            start_date = end_date.replace(day=1)
            attrs["start_date"] = start_date
        if end_date is not None:
            attrs["end_date"] = end_date
        if start_date is not None and end_date is not None and start_date > end_date:
            raise serializers.ValidationError(
                {"start_date": "Start date must be on or before end date."}
            )
        return attrs


class ReportOpeningSummarySerializer(serializers.Serializer):
    net_revenue = serializers.DecimalField(max_digits=20, decimal_places=2)
    cash_collected = serializers.DecimalField(max_digits=20, decimal_places=2)
    expenses = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_commission_cost = serializers.DecimalField(max_digits=20, decimal_places=2)
    commission_payouts = serializers.DecimalField(max_digits=20, decimal_places=2)
    inventory_purchases = serializers.DecimalField(max_digits=20, decimal_places=2)
    inventory_usage_cost = serializers.DecimalField(max_digits=20, decimal_places=2)
    outstanding_payments = serializers.DecimalField(max_digits=20, decimal_places=2)
    gross_profit_estimate = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_operating_result = serializers.DecimalField(max_digits=20, decimal_places=2)


class ReportRevenueBreakdownSerializer(serializers.Serializer):
    sales_before_discounts = serializers.DecimalField(max_digits=20, decimal_places=2)
    discounts = serializers.DecimalField(max_digits=20, decimal_places=2)
    completed_sales = serializers.DecimalField(max_digits=20, decimal_places=2)
    sales_returns = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_revenue = serializers.DecimalField(max_digits=20, decimal_places=2)
    payments_received = serializers.DecimalField(max_digits=20, decimal_places=2)
    refunds_paid = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_cash_collected = serializers.DecimalField(max_digits=20, decimal_places=2)
    canceled_job_refunds = serializers.DecimalField(max_digits=20, decimal_places=2)


class ReportPeriodSalesSerializer(serializers.Serializer):
    period_start = serializers.DateField()
    sales = serializers.DecimalField(max_digits=20, decimal_places=2)
    refunds = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_revenue = serializers.DecimalField(max_digits=20, decimal_places=2)
    jobs = serializers.IntegerField()
    vehicles = serializers.IntegerField()


class ReportServiceSalesSerializer(serializers.Serializer):
    service = serializers.UUIDField()
    service_name = serializers.CharField()
    quantity = serializers.IntegerField()
    sales_before_discounts = serializers.DecimalField(max_digits=20, decimal_places=2)
    discounts = serializers.DecimalField(max_digits=20, decimal_places=2)
    revenue = serializers.DecimalField(max_digits=20, decimal_places=2)


class ReportExpenseCategorySerializer(serializers.Serializer):
    category = serializers.UUIDField()
    category_name = serializers.CharField()
    count = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=20, decimal_places=2)


class ReportExpensesSerializer(serializers.Serializer):
    total = serializers.DecimalField(max_digits=20, decimal_places=2)
    count = serializers.IntegerField()
    cancelled_amount = serializers.DecimalField(max_digits=20, decimal_places=2)
    cancelled_count = serializers.IntegerField()
    by_category = ReportExpenseCategorySerializer(many=True)


class ReportWorkerCommissionSerializer(serializers.Serializer):
    worker = serializers.UUIDField()
    worker_name = serializers.CharField()
    earned = serializers.DecimalField(max_digits=20, decimal_places=2)
    adjustments = serializers.DecimalField(max_digits=20, decimal_places=2)
    reversals = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_commission = serializers.DecimalField(max_digits=20, decimal_places=2)
    payouts = serializers.DecimalField(max_digits=20, decimal_places=2)


class ReportCommissionPayoutSerializer(serializers.Serializer):
    worker = serializers.UUIDField()
    worker_name = serializers.CharField()
    count = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=20, decimal_places=2)


class ReportCommissionsSerializer(serializers.Serializer):
    earned = serializers.DecimalField(max_digits=20, decimal_places=2)
    adjustments = serializers.DecimalField(max_digits=20, decimal_places=2)
    reversals = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_cost = serializers.DecimalField(max_digits=20, decimal_places=2)
    payout_count = serializers.IntegerField()
    payouts = serializers.DecimalField(max_digits=20, decimal_places=2)
    by_worker = ReportWorkerCommissionSerializer(many=True)
    payouts_by_worker = ReportCommissionPayoutSerializer(many=True)


class ReportInventoryProductSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    product_name = serializers.CharField()
    unit_label = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=20, decimal_places=3)
    amount = serializers.DecimalField(max_digits=20, decimal_places=2)


class ReportInventorySerializer(serializers.Serializer):
    purchase_count = serializers.IntegerField()
    purchases = serializers.DecimalField(max_digits=20, decimal_places=2)
    usage_quantity = serializers.DecimalField(max_digits=20, decimal_places=3)
    usage_cost = serializers.DecimalField(max_digits=20, decimal_places=2)
    adjustment_count = serializers.IntegerField()
    adjustment_value = serializers.DecimalField(max_digits=20, decimal_places=2)
    purchases_by_product = ReportInventoryProductSerializer(many=True)
    usage_by_product = ReportInventoryProductSerializer(many=True)


class ReportOutstandingPaymentsSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=20, decimal_places=2)
    job_count = serializers.IntegerField()
    cash_held_for_cancelled_jobs = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
    )


class OwnerReportSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    group_by = serializers.ChoiceField(choices=("daily", "weekly", "monthly"))
    opening_summary = ReportOpeningSummarySerializer()
    total_vehicles_serviced = serializers.IntegerField()
    unique_vehicles_serviced = serializers.IntegerField()
    completed_jobs = serializers.IntegerField()
    cancelled_jobs = serializers.IntegerField()
    revenue_breakdown = ReportRevenueBreakdownSerializer()
    sales_by_period = ReportPeriodSalesSerializer(many=True)
    sales_by_service = ReportServiceSalesSerializer(many=True)
    expenses = ReportExpensesSerializer()
    commissions = ReportCommissionsSerializer()
    inventory = ReportInventorySerializer()
    outstanding_payments = ReportOutstandingPaymentsSerializer()
    gross_profit_estimate = serializers.DecimalField(max_digits=20, decimal_places=2)
    net_operating_result = serializers.DecimalField(max_digits=20, decimal_places=2)
