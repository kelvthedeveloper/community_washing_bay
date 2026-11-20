from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    InventoryProductViewSet,
    InventoryPurchaseViewSet,
    InventoryReportViewSet,
    StockMovementViewSet,
    SupplierViewSet,
)


router = DefaultRouter()
router.register("products", InventoryProductViewSet, basename="inventory-product")
router.register("suppliers", SupplierViewSet, basename="inventory-supplier")
router.register("purchases", InventoryPurchaseViewSet, basename="inventory-purchase")
router.register("movements", StockMovementViewSet, basename="stock-movement")
router.register("reports", InventoryReportViewSet, basename="inventory-report")

urlpatterns = router.urls
