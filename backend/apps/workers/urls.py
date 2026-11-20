from rest_framework.routers import DefaultRouter

from apps.workers.views import WorkerViewSet


router = DefaultRouter()
router.register("workers", WorkerViewSet, basename="worker")

urlpatterns = router.urls
