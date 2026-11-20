from rest_framework.permissions import BasePermission

from apps.users.models import User


class CanViewOwnerReports(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (
                user.has_unrestricted_access
                or user.role == User.Role.ADMIN
            )
        )
