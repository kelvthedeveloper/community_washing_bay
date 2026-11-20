from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.reporting.exports import build_csv, build_pdf
from apps.reporting.permissions import CanViewOwnerReports
from apps.reporting.serializers import OwnerReportSerializer, ReportQuerySerializer
from apps.reporting.services import build_owner_report


class ReportViewSet(viewsets.ViewSet):
    permission_classes = [CanViewOwnerReports]

    def _report(self, request):
        query = ReportQuerySerializer(
            data=request.query_params,
            context={"today": timezone.localdate()},
        )
        query.is_valid(raise_exception=True)
        values = query.validated_data
        return build_owner_report(
            start_date=values["start_date"],
            end_date=values["end_date"],
            group_by=values["group_by"],
        )

    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses=OwnerReportSerializer,
    )
    @action(detail=False, methods=["get"])
    def summary(self, request, version=None):
        return Response(OwnerReportSerializer(self._report(request)).data)

    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses={200: OpenApiTypes.BINARY},
    )
    @action(detail=False, methods=["get"], url_path="exports/csv")
    def export_csv(self, request, version=None):
        report = self._report(request)
        response = HttpResponse(
            build_csv(report),
            content_type="text/csv; charset=utf-8",
        )
        response["Content-Disposition"] = (
            "attachment; filename="
            f'"community-washing-bay-report-{report["start_date"]}-'
            f'{report["end_date"]}.csv"'
        )
        return response

    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses={200: OpenApiTypes.BINARY},
    )
    @action(detail=False, methods=["get"], url_path="exports/pdf")
    def export_pdf(self, request, version=None):
        report = self._report(request)
        response = HttpResponse(
            build_pdf(report),
            content_type="application/pdf",
        )
        response["Content-Disposition"] = (
            "attachment; filename="
            f'"community-washing-bay-report-{report["start_date"]}-'
            f'{report["end_date"]}.pdf"'
        )
        return response
