from types import SimpleNamespace

from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.core.permissions import IsAdmin, IsManager, IsSuperAdmin
from apps.users.models import User


class BusinessRolePermissionTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def has_permission(self, permission_class, user):
        request = self.factory.get("/")
        request.user = user
        return permission_class().has_permission(request, SimpleNamespace())

    def test_each_role_is_allowed_by_its_matching_permission(self):
        users = {
            User.Role.SUPER_ADMIN: User(role=User.Role.SUPER_ADMIN),
            User.Role.ADMIN: User(role=User.Role.ADMIN),
            User.Role.MANAGER: User(role=User.Role.MANAGER),
        }
        permissions = {
            User.Role.SUPER_ADMIN: IsSuperAdmin,
            User.Role.ADMIN: IsAdmin,
            User.Role.MANAGER: IsManager,
        }

        for role, permission_class in permissions.items():
            with self.subTest(role=role):
                self.assertTrue(self.has_permission(permission_class, users[role]))

    def test_super_admin_bypasses_every_role_permission(self):
        super_admin = User(role=User.Role.SUPER_ADMIN)

        for permission_class in (IsSuperAdmin, IsAdmin, IsManager):
            with self.subTest(permission=permission_class.__name__):
                self.assertTrue(self.has_permission(permission_class, super_admin))

    def test_roles_do_not_bypass_other_role_permissions(self):
        admin = User(role=User.Role.ADMIN)
        manager = User(role=User.Role.MANAGER)

        self.assertFalse(self.has_permission(IsManager, admin))
        self.assertFalse(self.has_permission(IsAdmin, manager))
        self.assertFalse(self.has_permission(IsSuperAdmin, admin))
        self.assertFalse(self.has_permission(IsSuperAdmin, manager))

    def test_anonymous_users_are_denied(self):
        self.assertFalse(self.has_permission(IsAdmin, AnonymousUser()))
        self.assertFalse(self.has_permission(IsManager, AnonymousUser()))

    def test_inactive_users_are_denied_even_when_their_role_matches(self):
        inactive_users = (
            (IsSuperAdmin, User(role=User.Role.SUPER_ADMIN, is_active=False)),
            (IsAdmin, User(role=User.Role.ADMIN, is_active=False)),
            (IsManager, User(role=User.Role.MANAGER, is_active=False)),
        )

        for permission_class, user in inactive_users:
            with self.subTest(role=user.role):
                self.assertFalse(self.has_permission(permission_class, user))
