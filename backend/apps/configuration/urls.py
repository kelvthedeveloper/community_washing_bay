from rest_framework.routers import DefaultRouter

from apps.configuration.views import (
    CommissionSettingViewSet,
    ExpenseCategoryViewSet,
    InventoryCategoryViewSet,
    ServicePricingViewSet,
    ServiceViewSet,
    VehicleTypeViewSet,
)


router = DefaultRouter()
router.register("vehicle-types", VehicleTypeViewSet, basename="vehicle-type")
router.register("services", ServiceViewSet, basename="service")
router.register("service-pricing", ServicePricingViewSet, basename="service-pricing")
router.register(
    "commission-settings",
    CommissionSettingViewSet,
    basename="commission-setting",
)
router.register(
    "expense-categories",
    ExpenseCategoryViewSet,
    basename="expense-category",
)
router.register(
    "inventory-categories",
    InventoryCategoryViewSet,
    basename="inventory-category",
)

urlpatterns = router.urls
