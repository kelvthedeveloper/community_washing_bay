from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from django.utils.dateparse import parse_date
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.jobs.models import Job
from apps.jobs.serializers import JobReadSerializer
from apps.workers.models import CommissionLedgerEntry, Worker
from apps.workers.permissions import (
    CanManageWorkers,
    CanViewAndRecordCommissionPayments,
    CanViewOrManageCommissionLedger,
)
from apps.workers.serializers import (
    CommissionLedgerEntrySerializer,
    CommissionLedgerMutationSerializer,
    CommissionPaymentSerializer,
    WorkerSerializer,
)
from apps.workers.services import (
    get_worker_commission_summary,
)


class WorkerPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class WorkerViewSet(viewsets.ModelViewSet):
    queryset = Worker.objects.all()
    serializer_class = WorkerSerializer
    permission_classes = [CanManageWorkers]
    pagination_class = WorkerPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = {"is_active": ["exact"]}
    search_fields = ["full_name", "phone_number"]
    ordering_fields = ["full_name", "employment_date", "created_at", "updated_at"]
    ordering = ["full_name"]

    def perform_destroy(self, instance):
        with transaction.atomic():
            worker = Worker.objects.select_for_update().get(pk=instance.pk)
            worker.deactivate()

    @action(detail=True, methods=["get"], url_path="job-history")
    def job_history(self, _request, **_kwargs):
        worker = self.get_object()
        queryset = (
            worker.jobs.select_related(
                "vehicle_type",
                "vehicle",
                "created_by",
                "updated_by",
                "discount_applied_by",
            )
            .prefetch_related(
                "job_services__service",
                "worker_assignments__worker",
            )
            .all()
        )
        page = self.paginate_queryset(queryset)
        serializer = JobReadSerializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="commission-summary")
    def commission_summary(self, request, **_kwargs):
        worker = self.get_object()
        date_value = request.query_params.get("date")
        summary_date = parse_date(date_value) if date_value else timezone.localdate()
        if summary_date is None:
            raise serializers.ValidationError(
                {"date": "Use a valid date in YYYY-MM-DD format."}
            )

        period = request.query_params.get("period", "daily")
        if period not in {"daily", "weekly", "monthly"}:
            raise serializers.ValidationError(
                {"period": "Choose daily, weekly, or monthly."}
            )
        summary = get_worker_commission_summary(
            worker,
            summary_date=summary_date,
            period=period,
        )
        response_data = {
            "period": summary["period"],
            "period_start": summary["period_start"].isoformat(),
            "period_end": summary["period_end"].isoformat(),
            "earned_commission": format_money(summary["earned_commission"]),
            "paid_commission": format_money(summary["paid_commission"]),
            "outstanding_commission": format_money(
                summary["outstanding_commission"]
            ),
        }
        if period == "daily":
            response_data["date"] = summary["date"].isoformat()
            response_data["daily_commission"] = format_money(
                summary["daily_commission"]
            )
        return Response(response_data)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="commission-payments",
        permission_classes=[CanViewAndRecordCommissionPayments],
    )
    def commission_payments(self, request, **_kwargs):
        worker = self.get_object()
        if request.method in {"GET", "HEAD"}:
            queryset = worker.commission_payments.select_related("recorded_by").all()
            page = self.paginate_queryset(queryset)
            serializer = CommissionPaymentSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        with transaction.atomic():
            locked_worker = Worker.objects.select_for_update().get(pk=worker.pk)
            serializer = CommissionPaymentSerializer(
                data=request.data,
                context={"worker": locked_worker},
            )
            serializer.is_valid(raise_exception=True)
            payment = serializer.save(
                worker=locked_worker,
                recorded_by=request.user,
            )
        return Response(
            CommissionPaymentSerializer(payment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="commission-ledger",
        permission_classes=[CanViewOrManageCommissionLedger],
    )
    def commission_ledger(self, request, **_kwargs):
        worker = self.get_object()
        if request.method in {"GET", "HEAD"}:
            queryset = worker.commission_ledger_entries.select_related(
                "job",
                "assignment",
                "source_entry",
                "recorded_by",
            ).prefetch_related(
                Prefetch(
                    "reversal_entries",
                    queryset=CommissionLedgerEntry.objects.filter(
                        entry_type=CommissionLedgerEntry.EntryType.REVERSAL
                    ),
                )
            )
            page = self.paginate_queryset(queryset)
            serializer = CommissionLedgerEntrySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        with transaction.atomic():
            locked_worker = Worker.objects.select_for_update().get(pk=worker.pk)
            serializer = CommissionLedgerMutationSerializer(
                data=request.data,
                context={"worker": locked_worker},
            )
            serializer.is_valid(raise_exception=True)
            values = serializer.validated_data
            source_entry = values.get("source_entry")
            if source_entry is not None:
                source_entry = CommissionLedgerEntry.objects.select_for_update().get(
                    pk=source_entry.pk,
                    worker=locked_worker,
                )
                if (
                    values["entry_type"] == CommissionLedgerEntry.EntryType.REVERSAL
                    and source_entry.reversal_entries.exists()
                ):
                    raise serializers.ValidationError(
                        {"source_entry": "This entry has already been reversed."}
                    )

            is_reversal = (
                values["entry_type"] == CommissionLedgerEntry.EntryType.REVERSAL
            )
            amount = -source_entry.amount if is_reversal else values["amount"]
            entry = CommissionLedgerEntry.objects.create(
                worker=locked_worker,
                job=source_entry.job if source_entry is not None else None,
                assignment=(
                    source_entry.assignment if source_entry is not None else None
                ),
                source_entry=source_entry,
                entry_type=values["entry_type"],
                amount=amount,
                effective_date=values.get("effective_date", timezone.localdate()),
                reason=values["reason"],
                recorded_by=request.user,
            )
        return Response(
            CommissionLedgerEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )


def format_money(value):
    return f"{value.quantize(Decimal('0.01')):.2f}"
