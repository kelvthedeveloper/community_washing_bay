from rest_framework.routers import DefaultRouter

from apps.jobs.views import JobViewSet, PosSaleViewSet, VehicleViewSet


router = DefaultRouter()
router.register("pos/sales", PosSaleViewSet, basename="pos-sale")
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("jobs", JobViewSet, basename="job")

urlpatterns = router.urls
