from decimal import Decimal

from django.db.models import Count, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import filters, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.inventory.models import (
    InventoryProduct,
    InventoryPurchase,
    StockMovement,
    Supplier,
)
from apps.inventory.permissions import (
    CanManageInventory,
    CanRecordInventoryTransactions,
    CanViewInventory,
    CanViewOrManageInventory,
)
from apps.inventory.serializers import (
    InventoryAdjustmentSerializer,
    InventoryMovementReportSerializer,
    InventoryProductSerializer,
    InventoryPurchaseReadSerializer,
    InventoryPurchaseWriteSerializer,
    InventoryUsageSerializer,
    InventoryValuationReportSerializer,
    StockMovementSerializer,
    SupplierSerializer,
    format_cost,
    format_money,
    format_quantity,
)
from apps.inventory.services import (
    ZERO_QUANTITY,
    ZERO_VALUE,
    annotate_inventory_products,
    record_inventory_adjustment,
    record_inventory_purchase,
    record_inventory_usage,
)


class InventoryPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [CanViewOrManageInventory]
    pagination_class = InventoryPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = {"is_active": ["exact"]}
    search_fields = ["name", "contact_name", "phone_number", "email"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]

    def perform_destroy(self, instance):
        if instance.is_active:
            instance.is_active = False
            instance.save(update_fields={"is_active", "updated_at"})


class InventoryProductViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryProductSerializer
    permission_classes = [CanViewOrManageInventory]
    pagination_class = InventoryPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = {
        "category": ["exact"],
        "is_active": ["exact"],
    }
    search_fields = ["name", "sku", "category__name"]
    ordering_fields = [
        "name",
        "created_at",
        "updated_at",
        "stock_on_hand",
        "stock_value",
    ]
    ordering = ["name"]

    def get_queryset(self):
        queryset = annotate_inventory_products(
            InventoryProduct.objects.select_related("category")
        )
        if self.request.query_params.get("low_stock", "").lower() in {
            "true",
            "1",
        }:
            queryset = queryset.filter(
                is_active=True,
                stock_on_hand__lte=F("low_stock_threshold"),
            )
        return queryset

    def perform_destroy(self, instance):
        if instance.is_active:
            instance.is_active = False
            instance.save(update_fields={"is_active", "updated_at"})

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request, **_kwargs):
        queryset = self.filter_queryset(
            self.get_queryset().filter(
                is_active=True,
                stock_on_hand__lte=F("low_stock_threshold"),
            )
        )
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[CanRecordInventoryTransactions],
    )
    def usage(self, request, **_kwargs):
        product = self.get_object()
        serializer = InventoryUsageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movement = record_inventory_usage(
            product_id=product.pk,
            actor=request.user,
            **serializer.validated_data,
        )
        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[CanManageInventory],
    )
    def adjustment(self, request, **_kwargs):
        product = self.get_object()
        serializer = InventoryAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        values.setdefault("unit_cost", None)
        movement = record_inventory_adjustment(
            product_id=product.pk,
            actor=request.user,
            **values,
        )
        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )


class InventoryPurchaseViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = InventoryPurchase.objects.select_related(
        "supplier",
        "recorded_by",
    ).prefetch_related(
        "lines__product",
    )
    serializer_class = InventoryPurchaseReadSerializer
    permission_classes = [CanRecordInventoryTransactions]
    pagination_class = InventoryPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = {
        "supplier": ["exact"],
        "purchase_date": ["exact", "gte", "lte"],
    }
    ordering_fields = ["purchase_date", "total_cost", "created_at"]
    ordering = ["-purchase_date", "-created_at"]

    def create(self, request, *args, **kwargs):
        serializer = InventoryPurchaseWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purchase = record_inventory_purchase(
            actor=request.user,
            **serializer.validated_data,
        )
        output = self.get_serializer(purchase)
        return Response(output.data, status=status.HTTP_201_CREATED)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related(
        "product",
        "purchase__supplier",
        "recorded_by",
    )
    serializer_class = StockMovementSerializer
    permission_classes = [CanViewInventory]
    pagination_class = InventoryPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = {
        "product": ["exact"],
        "movement_type": ["exact"],
        "purchase": ["exact"],
        "occurred_at": ["date", "date__gte", "date__lte"],
    }
    search_fields = ["product__name", "product__sku", "reason"]
    ordering_fields = ["occurred_at", "quantity", "value_change", "created_at"]
    ordering = ["-occurred_at", "-created_at"]


class InventoryReportViewSet(viewsets.ViewSet):
    permission_classes = [CanViewInventory]
    serializer_class = InventoryValuationReportSerializer

    @extend_schema(responses=InventoryValuationReportSerializer)
    @action(detail=False, methods=["get"])
    def valuation(self, request, **_kwargs):
        as_of = parse_date(request.query_params.get("as_of", ""))
        if request.query_params.get("as_of") and as_of is None:
            raise serializers.ValidationError(
                {"as_of": "Use a valid date in YYYY-MM-DD format."}
            )
        as_of = as_of or timezone.localdate()
        date_filter = Q(movements__occurred_at__date__lte=as_of)
        quantity_field = Decimal("0.000")
        value_field = Decimal("0.00")
        products = InventoryProduct.objects.select_related("category").annotate(
            report_quantity=Coalesce(
                Sum("movements__quantity", filter=date_filter),
                Value(quantity_field),
            ),
            report_value=Coalesce(
                Sum("movements__value_change", filter=date_filter),
                Value(value_field),
            ),
        )
        items = []
        total_value = ZERO_VALUE
        low_stock_count = 0
        for product in products:
            quantity = product.report_quantity
            value = product.report_value
            total_value += value
            is_low_stock = product.is_active and quantity <= product.low_stock_threshold
            low_stock_count += int(is_low_stock)
            items.append(
                {
                    "product": str(product.pk),
                    "name": product.name,
                    "sku": product.sku,
                    "category": product.category.name,
                    "unit_label": product.unit_label,
                    "is_active": product.is_active,
                    "quantity_on_hand": format_quantity(quantity),
                    "average_unit_cost": format_cost(
                        (value / quantity) if quantity > ZERO_QUANTITY else ZERO_VALUE
                    ),
                    "stock_value": format_money(value),
                    "is_low_stock": is_low_stock,
                }
            )
        return Response(
            {
                "as_of": as_of.isoformat(),
                "total_stock_value": format_money(total_value),
                "low_stock_count": low_stock_count,
                "items": items,
            }
        )

    @extend_schema(responses=InventoryMovementReportSerializer)
    @action(detail=False, methods=["get"], url_path="movements")
    def movement_report(self, request, **_kwargs):
        today = timezone.localdate()
        start_value = request.query_params.get("start_date")
        end_value = request.query_params.get("end_date")
        start_date = parse_date(start_value) if start_value else today.replace(day=1)
        end_date = parse_date(end_value) if end_value else today
        if start_date is None:
            raise serializers.ValidationError(
                {"start_date": "Use a valid date in YYYY-MM-DD format."}
            )
        if end_date is None:
            raise serializers.ValidationError(
                {"end_date": "Use a valid date in YYYY-MM-DD format."}
            )
        if start_date > end_date:
            raise serializers.ValidationError(
                {"start_date": "Start date must be on or before end date."}
            )

        period_filter = Q(
            movements__occurred_at__date__gte=start_date,
            movements__occurred_at__date__lte=end_date,
        )
        purchase_filter = period_filter & Q(
            movements__movement_type=StockMovement.Type.PURCHASE
        )
        usage_filter = period_filter & Q(
            movements__movement_type=StockMovement.Type.USAGE
        )
        adjustment_filter = period_filter & Q(
            movements__movement_type=StockMovement.Type.ADJUSTMENT
        )
        products = InventoryProduct.objects.annotate(
            purchased_quantity=Coalesce(
                Sum("movements__quantity", filter=purchase_filter),
                Value(ZERO_QUANTITY),
            ),
            purchase_cost=Coalesce(
                Sum("movements__value_change", filter=purchase_filter),
                Value(ZERO_VALUE),
            ),
            used_quantity=Coalesce(
                Sum("movements__quantity", filter=usage_filter),
                Value(ZERO_QUANTITY),
            ),
            usage_cost=Coalesce(
                Sum("movements__value_change", filter=usage_filter),
                Value(ZERO_VALUE),
            ),
            adjustment_quantity=Coalesce(
                Sum("movements__quantity", filter=adjustment_filter),
                Value(ZERO_QUANTITY),
            ),
            movement_count=Coalesce(
                Count("movements", filter=period_filter),
                Value(0),
            ),
        ).filter(movement_count__gt=0).order_by("name")

        rows = []
        total_purchase_cost = ZERO_VALUE
        total_usage_cost = ZERO_VALUE
        total_movements = 0
        for product in products:
            purchase_cost = product.purchase_cost
            usage_cost = -product.usage_cost
            total_purchase_cost += purchase_cost
            total_usage_cost += usage_cost
            total_movements += product.movement_count
            rows.append(
                {
                    "product": str(product.pk),
                    "name": product.name,
                    "unit_label": product.unit_label,
                    "purchased_quantity": format_quantity(
                        product.purchased_quantity
                    ),
                    "purchase_cost": format_money(purchase_cost),
                    "used_quantity": format_quantity(-product.used_quantity),
                    "usage_cost": format_money(usage_cost),
                    "adjustment_quantity": format_quantity(
                        product.adjustment_quantity
                    ),
                    "movement_count": product.movement_count,
                }
            )
        return Response(
            {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "movement_count": total_movements,
                "total_purchase_cost": format_money(total_purchase_cost),
                "total_usage_cost": format_money(total_usage_cost),
                "items": rows,
            }
        )
