from rest_framework.permissions import SAFE_METHODS

from apps.core.permissions import HasBusinessRole
from apps.users.models import User


class CanManageWorkers(HasBusinessRole):
    allowed_roles = frozenset({User.Role.ADMIN, User.Role.MANAGER})


class CanManageWorkerJobs(HasBusinessRole):
    allowed_roles = frozenset({User.Role.ADMIN, User.Role.MANAGER})


class CanViewAndRecordCommissionPayments(HasBusinessRole):
    allowed_roles = frozenset({User.Role.ADMIN, User.Role.MANAGER})

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return super().has_permission(request, view)
        return super().has_permission(request, view) and (
            request.user.has_unrestricted_access
            or request.user.role == User.Role.ADMIN
        )


class CanViewOrManageCommissionLedger(HasBusinessRole):
    allowed_roles = frozenset({User.Role.ADMIN, User.Role.MANAGER})

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return super().has_permission(request, view)
        return super().has_permission(request, view) and (
            request.user.has_unrestricted_access
            or request.user.role == User.Role.ADMIN
        )
