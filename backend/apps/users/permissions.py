from rest_framework.permissions import BasePermission

from apps.users.models import User


class CanManageUserAccounts(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.role in {User.Role.SUPER_ADMIN, User.Role.ADMIN}
        )

    def has_object_permission(self, request, view, obj) -> bool:
        if not self.has_permission(request, view):
            return False
        if request.user.has_unrestricted_access:
            return True
        return (
            request.user.role == User.Role.ADMIN
            and obj.role == User.Role.MANAGER
        )
