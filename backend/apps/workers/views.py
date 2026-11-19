from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import filters, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.workers.models import Worker, WorkerJob
from apps.workers.permissions import (
    CanManageWorkerJobs,
    CanManageWorkers,
    CanViewAndRecordCommissionPayments,
)
from apps.workers.serializers import (
    CommissionPaymentSerializer,
    WorkerJobSerializer,
    WorkerSerializer,
)
from apps.workers.services import complete_worker_job, get_worker_outstanding_commission


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
        queryset = worker.jobs.select_related("vehicle_type", "service").all()
        page = self.paginate_queryset(queryset)
        serializer = WorkerJobSerializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="commission-summary")
    def commission_summary(self, request, **_kwargs):
        worker = self.get_object()
        date_value = request.query_params.get("date")
        summary_date = (
            parse_date(date_value) if date_value else timezone.localdate()
        )
        if summary_date is None:
            raise serializers.ValidationError(
                {"date": "Use a valid date in YYYY-MM-DD format."}
            )

        daily_total = WorkerJob.objects.filter(
            worker=worker,
            status=WorkerJob.Status.COMPLETED,
            completed_at__date=summary_date,
        ).aggregate(total=Sum("commission_amount"))["total"]
        return Response(
            {
                "date": summary_date.isoformat(),
                "daily_commission": format_money(daily_total or Decimal("0.00")),
                "outstanding_commission": format_money(
                    get_worker_outstanding_commission(worker)
                ),
            }
        )

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


class WorkerJobViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = WorkerJob.objects.select_related(
        "worker",
        "vehicle_type",
        "service",
    )
    serializer_class = WorkerJobSerializer
    permission_classes = [CanManageWorkerJobs]
    pagination_class = WorkerPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["worker", "vehicle_type", "service", "status"]
    search_fields = ["worker__full_name", "vehicle_type__name", "service__name"]
    ordering_fields = ["assigned_at", "completed_at", "status", "created_at"]
    ordering = ["-assigned_at"]

    def perform_create(self, serializer):
        worker_id = serializer.validated_data["worker"].pk
        with transaction.atomic():
            worker = Worker.objects.select_for_update().get(pk=worker_id)
            if not worker.is_active:
                raise serializers.ValidationError(
                    {"worker": "Inactive workers cannot be assigned to new jobs."}
                )
            serializer.save(worker=worker)

    @action(detail=True, methods=["post"])
    def complete(self, _request, **_kwargs):
        with transaction.atomic():
            job = get_object_or_404(
                WorkerJob.objects.select_for_update(),
                pk=self.get_object().pk,
            )
            complete_worker_job(job)
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def cancel(self, _request, **_kwargs):
        with transaction.atomic():
            job = get_object_or_404(
                WorkerJob.objects.select_for_update(),
                pk=self.get_object().pk,
            )
            if job.status != WorkerJob.Status.ASSIGNED:
                raise serializers.ValidationError(
                    {"status": "Only assigned jobs can be cancelled."}
                )
            job.status = WorkerJob.Status.CANCELLED
            job.save(update_fields={"status", "updated_at"})
        return Response(self.get_serializer(job).data)


def format_money(value):
    return f"{value.quantize(Decimal('0.01')):.2f}"
