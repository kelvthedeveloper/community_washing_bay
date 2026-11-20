from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.configuration.models import Service, VehicleType
from apps.jobs.models import Job, JobPayment, JobRefund, Vehicle
from apps.jobs.serializers import (
    JobCreateSerializer,
    JobPaymentSerializer,
    JobRefundReadSerializer,
    JobRefundWriteSerializer,
    JobQuoteQuerySerializer,
    JobReadSerializer,
    JobReceiptSerializer,
    PosSaleSerializer,
    VehicleSerializer,
    parse_idempotency_key,
)
from apps.jobs.services import (
    IdempotencyConflict,
    allocate_discount,
    build_refund_fingerprint,
    build_job_quote,
    calculate_discount,
    money_string,
    record_job_refund,
    transition_job,
)
from apps.jobs.permissions import CanViewAndRecordJobRefunds
from apps.workers.permissions import CanManageWorkerJobs


class JobPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class JobViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = JobReadSerializer
    permission_classes = [CanManageWorkerJobs]
    pagination_class = JobPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = {
        "job_date": ["exact", "gte", "lte"],
        "status": ["exact"],
        "vehicle_type": ["exact"],
        "number_plate": ["exact"],
    }
    search_fields = ["number_plate"]
    ordering_fields = ["job_date", "registered_at", "status", "number_plate"]
    ordering = ["-registered_at"]

    def get_queryset(self):
        return (
            Job.objects.select_related(
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

    def get_serializer_class(self):
        if self.action == "create":
            return JobCreateSerializer
        return JobReadSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = serializer.save()
        job = self.get_queryset().get(pk=job.pk)
        return Response(
            JobReadSerializer(job, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def quote(self, request, **_kwargs):
        raw_services = request.query_params.get("services", "")
        query_serializer = JobQuoteQuerySerializer(
            data={
                "vehicle_type": request.query_params.get("vehicle_type"),
                "services": raw_services.split(",") if raw_services else [],
                "discount_type": request.query_params.get("discount_type", "NONE"),
                "discount_value": request.query_params.get("discount_value", "0.00"),
            },
            context={"request": request},
        )
        query_serializer.is_valid(raise_exception=True)
        values = query_serializer.validated_data
        vehicle_type = get_object_or_404(
            VehicleType,
            pk=values["vehicle_type"],
        )
        services_by_id = {
            service.pk: service
            for service in Service.objects.filter(pk__in=values["services"])
        }
        if len(services_by_id) != len(values["services"]):
            raise serializers.ValidationError(
                {"services": "One or more selected services do not exist."}
            )
        services = [services_by_id[pk] for pk in values["services"]]
        quote = build_job_quote(vehicle_type, services, timezone.localdate())
        discount_amount = calculate_discount(
            quote["subtotal"],
            values["discount_type"],
            values["discount_value"],
        )
        discount_lines = allocate_discount(
            quote["services"],
            discount_amount,
            quote["subtotal"],
        )
        return Response(
            {
                "job_date": quote["job_date"].isoformat(),
                "vehicle_type": str(vehicle_type.pk),
                "subtotal": money_string(quote["subtotal"]),
                "discount_type": values["discount_type"],
                "discount_value": money_string(values["discount_value"]),
                "discount_amount": money_string(discount_amount),
                "services": [
                    {
                        "id": str(line["service"].pk),
                        "name": line["service"].name,
                        "price": money_string(line["price"]),
                        "discount_amount": money_string(discount),
                        "total": money_string(line["price"] - discount),
                        "commission_rate": money_string(line["commission_rate"]),
                    }
                    for line, discount in zip(quote["services"], discount_lines)
                ],
                "total_price": money_string(quote["subtotal"] - discount_amount),
            }
        )

    @action(detail=True, methods=["post"])
    def start(self, request, **_kwargs):
        job = transition_job(
            job_id=self.get_object().pk,
            target_status=Job.Status.IN_PROGRESS,
            actor=request.user,
        )
        return self._job_response(job)

    @action(detail=True, methods=["post"])
    def complete(self, request, **_kwargs):
        job = transition_job(
            job_id=self.get_object().pk,
            target_status=Job.Status.COMPLETED,
            actor=request.user,
        )
        return self._job_response(job)

    @action(detail=True, methods=["post"])
    def cancel(self, request, **_kwargs):
        job = transition_job(
            job_id=self.get_object().pk,
            target_status=Job.Status.CANCELLED,
            actor=request.user,
        )
        return self._job_response(job)

    @action(detail=True, methods=["get", "post"], url_path="payments")
    def payments(self, request, **_kwargs):
        job = self.get_object()
        if request.method in {"GET", "HEAD"}:
            queryset = job.payments.select_related("recorded_by").all()
            page = self.paginate_queryset(queryset)
            serializer = JobPaymentSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        idempotency_key = parse_idempotency_key(
            request.headers.get("Idempotency-Key")
        )
        serializer = JobPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment_data = serializer.validated_data
        with transaction.atomic():
            locked_job = Job.objects.select_for_update().get(pk=job.pk)
            existing = JobPayment.objects.select_for_update().filter(
                idempotency_key=idempotency_key
            ).first()
            if existing is not None:
                if payment_matches(existing, locked_job, payment_data):
                    return Response(
                        JobPaymentSerializer(existing).data,
                        status=status.HTTP_200_OK,
                        headers={"Idempotency-Replayed": "true"},
                    )
                raise IdempotencyConflict()
            if locked_job.status == Job.Status.CANCELLED:
                raise serializers.ValidationError(
                    {"job": "Payments cannot be recorded for cancelled jobs."}
                )
            if payment_data["amount"] > locked_job.amount_due:
                raise serializers.ValidationError(
                    {
                        "amount": (
                            "Payment exceeds the outstanding job balance of "
                            f"{locked_job.amount_due:.2f}."
                        )
                    }
                )
            try:
                with transaction.atomic():
                    payment = serializer.save(
                        job=locked_job,
                        recorded_by=request.user,
                        idempotency_key=idempotency_key,
                    )
            except IntegrityError:
                existing = JobPayment.objects.select_for_update().filter(
                    idempotency_key=idempotency_key
                ).first()
                if existing is None:
                    raise
                if payment_matches(existing, locked_job, payment_data):
                    return Response(
                        JobPaymentSerializer(existing).data,
                        status=status.HTTP_200_OK,
                        headers={"Idempotency-Replayed": "true"},
                    )
                raise IdempotencyConflict()
            locked_job.amount_paid += payment.amount
            locked_job.updated_by = request.user
            locked_job.save(
                update_fields={"amount_paid", "updated_by", "updated_at"}
            )
        return Response(
            JobPaymentSerializer(payment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def receipt(self, request, **_kwargs):
        job = self.get_object()
        data = {
            "receipt_number": f"CBW-{job.pk.hex[:10].upper()}",
            "issued_at": timezone.now(),
            "job": job,
            "payments": job.payments.select_related("recorded_by").all(),
            "refunds": JobRefund.objects.filter(payment__job=job)
            .select_related("payment", "recorded_by")
            .all(),
        }
        return Response(
            JobReceiptSerializer(data, context=self.get_serializer_context()).data
        )

    @action(
        detail=True,
        methods=["get", "post"],
        permission_classes=[CanViewAndRecordJobRefunds],
    )
    def refunds(self, request, **_kwargs):
        job = self.get_object()
        queryset = JobRefund.objects.filter(payment__job=job).select_related(
            "payment",
            "recorded_by",
        )
        if request.method in {"GET", "HEAD"}:
            page = self.paginate_queryset(queryset)
            return self.get_paginated_response(
                JobRefundReadSerializer(page, many=True).data
            )

        idempotency_key = parse_idempotency_key(
            request.headers.get("Idempotency-Key")
        )
        serializer = JobRefundWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        fingerprint = build_refund_fingerprint(
            job=job,
            payment=values["payment"],
            amount=values["amount"],
            refund_date=values["refund_date"],
            reason=values["reason"],
        )
        refund, replayed = record_job_refund(
            job_id=job.pk,
            payment_id=values["payment"].pk,
            amount=values["amount"],
            refund_date=values["refund_date"],
            reason=values["reason"],
            actor=request.user,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        return Response(
            JobRefundReadSerializer(refund).data,
            status=status.HTTP_200_OK if replayed else status.HTTP_201_CREATED,
            headers={"Idempotency-Replayed": "true"} if replayed else None,
        )

    def _job_response(self, job):
        job = self.get_queryset().get(pk=job.pk)
        return Response(
            JobReadSerializer(job, context=self.get_serializer_context()).data
        )


class PosSaleViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = PosSaleSerializer
    permission_classes = [CanManageWorkerJobs]

    def create(self, request, *args, **kwargs):
        idempotency_key = parse_idempotency_key(
            request.headers.get("Idempotency-Key")
        )
        serializer = self.get_serializer(
            data=request.data,
            context={
                **self.get_serializer_context(),
                "idempotency_key": idempotency_key,
            },
        )
        serializer.is_valid(raise_exception=True)
        job = serializer.save()
        job = (
            Job.objects.select_related(
                "vehicle",
                "vehicle_type",
                "created_by",
                "updated_by",
                "discount_applied_by",
            )
            .prefetch_related("job_services__service", "worker_assignments__worker")
            .get(pk=job.pk)
        )
        replayed = serializer.context["idempotent_replay"]
        return Response(
            JobReadSerializer(job, context=self.get_serializer_context()).data,
            status=status.HTTP_200_OK if replayed else status.HTTP_201_CREATED,
            headers={"Idempotency-Replayed": "true"} if replayed else None,
        )


class VehicleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Vehicle.objects.select_related("vehicle_type").all()
    serializer_class = VehicleSerializer
    permission_classes = [CanManageWorkerJobs]
    pagination_class = JobPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["number_plate"]
    ordering_fields = ["number_plate", "created_at"]
    ordering = ["number_plate"]


def payment_matches(payment, job, payment_data):
    return (
        payment.job_id == job.pk
        and payment.amount == payment_data["amount"]
        and payment.method == payment_data["method"]
        and payment.payment_date == payment_data["payment_date"]
        and payment.notes == payment_data.get("notes", "")
    )
