from rest_framework.routers import DefaultRouter

from apps.reporting.views import ReportViewSet


router = DefaultRouter()
router.register("", ReportViewSet, basename="business-report")

urlpatterns = router.urls
