from rest_framework.routers import DefaultRouter

from apps.workers.views import WorkerJobViewSet, WorkerViewSet


router = DefaultRouter()
router.register("workers", WorkerViewSet, basename="worker")
router.register("jobs", WorkerJobViewSet, basename="worker-job")

urlpatterns = router.urls
