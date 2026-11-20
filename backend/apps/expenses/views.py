import calendar
from datetime import datetime
from decimal import Decimal
from pathlib import PurePosixPath

from django.db.models import Count, Sum
from django.db.models import F
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from drf_spectacular.types import OpenApiTypes
from rest_framework import filters, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.expenses.filters import ExpenseFilter
from apps.expenses.models import Expense, ExpenseHistory
from apps.expenses.permissions import (
    CanManageExpenseRecords,
    CanRecordExpenses,
    CanViewExpenses,
)
from apps.expenses.serializers import (
    ExpenseCancelSerializer,
    ExpenseDailyReportSerializer,
    ExpenseHistorySerializer,
    ExpenseMonthlyReportSerializer,
    ExpenseReadSerializer,
    ExpenseWriteSerializer,
)
from apps.expenses.services import cancel_expense, create_expense, update_expense


class ExpensePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class ExpenseViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ExpenseReadSerializer
    permission_classes = [CanViewExpenses]
    pagination_class = ExpensePagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ExpenseFilter
    search_fields = ["description", "category__name"]
    ordering_fields = [
        "expense_date",
        "amount",
        "payment_method",
        "created_at",
        "updated_at",
    ]
    ordering = ["-expense_date", "-created_at"]

    def get_queryset(self):
        return Expense.objects.select_related(
            "category",
            "recorded_by",
            "updated_by",
            "cancelled_by",
        )

    def get_permissions(self):
        if self.action in {"update", "partial_update", "cancel"}:
            permission_classes = [CanManageExpenseRecords]
        elif self.action == "create":
            permission_classes = [CanRecordExpenses]
        else:
            permission_classes = [CanViewExpenses]
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return ExpenseWriteSerializer
        if self.action == "cancel":
            return ExpenseCancelSerializer
        if self.action == "history":
            return ExpenseHistorySerializer
        return ExpenseReadSerializer

    @extend_schema(request=ExpenseWriteSerializer, responses=ExpenseReadSerializer)
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense = create_expense(
            actor=request.user,
            values=serializer.validated_data,
        )
        return Response(
            ExpenseReadSerializer(
                expense,
                context=self.get_serializer_context(),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=ExpenseWriteSerializer, responses=ExpenseReadSerializer)
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        expense = update_expense(
            expense_id=instance.pk,
            actor=request.user,
            values=serializer.validated_data,
        )
        return Response(
            ExpenseReadSerializer(
                expense,
                context=self.get_serializer_context(),
            ).data
        )

    @extend_schema(responses=ExpenseReadSerializer)
    @action(
        detail=True,
        methods=["post"],
        permission_classes=[CanManageExpenseRecords],
    )
    def cancel(self, request, **_kwargs):
        serializer = ExpenseCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense = cancel_expense(
            expense_id=self.get_object().pk,
            actor=request.user,
            reason=serializer.validated_data["reason"],
        )
        return Response(
            ExpenseReadSerializer(
                expense,
                context=self.get_serializer_context(),
            ).data
        )

    @extend_schema(responses=ExpenseHistorySerializer(many=True))
    @action(detail=True, methods=["get"])
    def history(self, request, **_kwargs):
        expense = self.get_object()
        entries = ExpenseHistory.objects.filter(expense=expense).select_related(
            "actor"
        )
        return Response(
            ExpenseHistorySerializer(
                entries,
                many=True,
                context=self.get_serializer_context(),
            ).data
        )

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="date",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Report date in YYYY-MM-DD format; defaults to today.",
            ),
        ],
        responses=ExpenseDailyReportSerializer,
    )
    @action(detail=False, methods=["get"], url_path="reports/daily")
    def daily_report(self, request, **_kwargs):
        raw_date = request.query_params.get("date")
        try:
            report_date = (
                parse_date(raw_date) if raw_date else timezone.localdate()
            )
        except ValueError:
            report_date = None
        if report_date is None:
            raise serializers.ValidationError(
                {"date": "Use a valid date in YYYY-MM-DD format."}
            )
        return Response(build_expense_report(report_date, report_date))

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="month",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Report month in YYYY-MM format; defaults to this month.",
            ),
        ],
        responses=ExpenseMonthlyReportSerializer,
    )
    @action(detail=False, methods=["get"], url_path="reports/monthly")
    def monthly_report(self, request, **_kwargs):
        month = request.query_params.get(
            "month",
            timezone.localdate().strftime("%Y-%m"),
        )
        try:
            month_start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
        except ValueError as exc:
            raise serializers.ValidationError(
                {"month": "Use a valid month in YYYY-MM format."}
            ) from exc
        if month_start.strftime("%Y-%m") != month:
            raise serializers.ValidationError(
                {"month": "Use a valid month in YYYY-MM format."}
            )
        last_day = calendar.monthrange(month_start.year, month_start.month)[1]
        month_end = month_start.replace(day=last_day)
        return Response(
            build_expense_report(
                month_start,
                month_end,
                month=month,
                include_daily_totals=True,
            )
        )

    @extend_schema(responses=OpenApiTypes.BINARY)
    @action(detail=True, methods=["get"], url_path="receipt")
    def receipt(self, request, **_kwargs):
        expense = self.get_object()
        if not expense.receipt:
            raise serializers.ValidationError(
                {"receipt": "No receipt is attached to this expense."}
            )
        response = FileResponse(
            expense.receipt.open("rb"),
            as_attachment=True,
            filename=(
                expense.receipt_original_name
                or PurePosixPath(expense.receipt.name).name
            ),
            content_type="application/octet-stream",
        )
        response["X-Content-Type-Options"] = "nosniff"
        return response


def build_expense_report(start_date, end_date, *, month=None, include_daily_totals=False):
    period = Expense.objects.filter(expense_date__range=(start_date, end_date))
    active_expenses = period.filter(cancelled_at__isnull=True)
    summary = active_expenses.aggregate(
        count=Count("id"),
        total=Sum("amount"),
    )
    report = {
        "expense_count": summary["count"],
        "cancelled_count": period.filter(cancelled_at__isnull=False).count(),
        "total_amount": summary["total"] or Decimal("0.00"),
        "by_category": list(
            active_expenses.values("category")
            .annotate(category_name=F("category__name"))
            .annotate(count=Count("id"), total_amount=Sum("amount"))
            .order_by("category__name")
        ),
        "by_payment_method": list(
            active_expenses.values("payment_method")
            .annotate(count=Count("id"), total_amount=Sum("amount"))
            .order_by("payment_method")
        ),
    }
    if month is None:
        report["date"] = start_date
    else:
        report["month"] = month
    if include_daily_totals:
        report["daily_totals"] = list(
            active_expenses.values("expense_date")
            .annotate(count=Count("id"), total_amount=Sum("amount"))
            .order_by("expense_date")
        )
    return report
