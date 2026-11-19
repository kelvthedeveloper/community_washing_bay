from rest_framework.permissions import BasePermission

from apps.users.models import User


class HasBusinessRole(BasePermission):
    allowed_roles: frozenset[str] = frozenset()

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        return (
            user.has_unrestricted_access
            or user.role in self.allowed_roles
        )

    def has_object_permission(self, request, view, obj) -> bool:
        return self.has_permission(request, view)


class IsSuperAdmin(HasBusinessRole):
    allowed_roles = frozenset({User.Role.SUPER_ADMIN})


class IsAdmin(HasBusinessRole):
    allowed_roles = frozenset({User.Role.ADMIN})


class IsManager(HasBusinessRole):
    allowed_roles = frozenset({User.Role.MANAGER})
