from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.pagination import PageNumberPagination

from apps.configuration.models import (
    CommissionSetting,
    ExpenseCategory,
    InventoryCategory,
    Service,
    ServicePricing,
    VehicleType,
)
from apps.configuration.permissions import CanViewOrManageBusinessConfiguration
from apps.configuration.serializers import (
    CommissionSettingSerializer,
    ExpenseCategorySerializer,
    InventoryCategorySerializer,
    ServicePricingSerializer,
    ServiceSerializer,
    VehicleTypeSerializer,
)


class ConfigurationPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class BaseConfigurationViewSet(viewsets.ModelViewSet):
    permission_classes = [CanViewOrManageBusinessConfiguration]
    pagination_class = ConfigurationPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    def perform_destroy(self, instance):
        instance.deactivate()


class VehicleTypeViewSet(BaseConfigurationViewSet):
    queryset = VehicleType.objects.all()
    serializer_class = VehicleTypeSerializer
    filterset_fields = {"is_active": ["exact"]}
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]


class ServiceViewSet(BaseConfigurationViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    filterset_fields = {"is_active": ["exact"]}
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]


class ServicePricingViewSet(BaseConfigurationViewSet):
    queryset = ServicePricing.objects.select_related("vehicle_type", "service")
    serializer_class = ServicePricingSerializer
    filterset_fields = {
        "vehicle_type": ["exact"],
        "service": ["exact"],
        "effective_date": ["exact", "gte", "lte"],
        "is_active": ["exact"],
    }
    search_fields = ["vehicle_type__name", "service__name"]
    ordering_fields = [
        "effective_date",
        "price",
        "created_at",
        "updated_at",
    ]
    ordering = ["-effective_date", "-created_at"]


class CommissionSettingViewSet(BaseConfigurationViewSet):
    queryset = CommissionSetting.objects.all()
    serializer_class = CommissionSettingSerializer
    filterset_fields = {
        "effective_date": ["exact", "gte", "lte"],
        "is_active": ["exact"],
        "commission_percentage": ["exact", "gte", "lte"],
    }
    ordering_fields = [
        "effective_date",
        "commission_percentage",
        "created_at",
        "updated_at",
    ]
    ordering = ["-effective_date", "-created_at"]


class ExpenseCategoryViewSet(BaseConfigurationViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    filterset_fields = {"is_active": ["exact"]}
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]


class InventoryCategoryViewSet(BaseConfigurationViewSet):
    queryset = InventoryCategory.objects.all()
    serializer_class = InventoryCategorySerializer
    filterset_fields = {"is_active": ["exact"]}
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]
