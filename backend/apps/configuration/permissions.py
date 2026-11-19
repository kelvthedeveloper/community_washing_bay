from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.users.models import User


class CanViewOrManageBusinessConfiguration(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        if user.has_unrestricted_access:
            return True
        if request.method in SAFE_METHODS:
            return user.role in {User.Role.ADMIN, User.Role.MANAGER}
        return user.role == User.Role.ADMIN
