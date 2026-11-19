from rest_framework.routers import DefaultRouter

from apps.users.views import UserManagementViewSet


router = DefaultRouter()
router.register("users", UserManagementViewSet, basename="user")

urlpatterns = router.urls
