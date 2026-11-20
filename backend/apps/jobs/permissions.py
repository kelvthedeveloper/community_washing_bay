from rest_framework.permissions import SAFE_METHODS

from apps.core.permissions import HasBusinessRole
from apps.users.models import User


class CanViewAndRecordJobRefunds(HasBusinessRole):
    allowed_roles = frozenset({User.Role.ADMIN, User.Role.MANAGER})

    def has_permission(self, request, view):
        allowed = super().has_permission(request, view)
        if request.method in SAFE_METHODS:
            return allowed
        return allowed and (
            request.user.has_unrestricted_access
            or request.user.role == User.Role.ADMIN
        )
