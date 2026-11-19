from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from apps.users.models import User
from apps.users.permissions import CanManageUserAccounts
from apps.users.serializers import (
    UserCreateSerializer,
    UserManagementSerializer,
    UserReadSerializer,
)


@extend_schema_view(
    create=extend_schema(responses={201: UserReadSerializer}),
)
class UserManagementViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageUserAccounts]
    queryset = User.objects.all()

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or not user.is_active:
            return User.objects.none()
        if user.has_unrestricted_access:
            return User.objects.all().order_by("username")
        if user.role == User.Role.ADMIN:
            return User.objects.filter(role=User.Role.MANAGER).order_by("username")
        return User.objects.none()

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in {"update", "partial_update"}:
            return UserManagementSerializer
        return UserReadSerializer

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise PermissionDenied("You cannot deactivate your own account.")
        instance.is_active = False
        instance.save(update_fields={"is_active"})
