import uuid

from django.test import TestCase
from django.utils import timezone

from apps.users.models import User


class UserModelTests(TestCase):
    def test_role_choices_are_exactly_the_business_roles(self):
        self.assertEqual(
            User.Role.values,
            ["SUPER_ADMIN", "ADMIN", "MANAGER"],
        )

    def test_regular_user_defaults_to_manager_with_uuid_and_aware_timestamp(self):
        user = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="test-password",
        )

        self.assertEqual(user.role, User.Role.MANAGER)
        self.assertIsInstance(user.pk, uuid.UUID)
        self.assertTrue(timezone.is_aware(user.date_joined))
        self.assertTrue(user.check_password("test-password"))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_superuser_is_a_super_admin_with_future_permissions(self):
        user = User.objects.create_superuser(
            username="root",
            email="root@example.com",
            password="test-password",
        )

        self.assertEqual(user.role, User.Role.SUPER_ADMIN)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.has_perm("future_app.future_permission"))
        self.assertTrue(user.has_perms(["future_app.future_permission"]))
        self.assertTrue(user.has_module_perms("future_app"))

    def test_inactive_super_admin_has_no_unrestricted_access(self):
        user = User.objects.create_superuser(
            username="disabled-root",
            email="disabled-root@example.com",
            password="test-password",
        )
        user.is_active = False

        self.assertFalse(user.has_unrestricted_access)
        self.assertFalse(user.has_perm("future_app.future_permission"))

    def test_demoting_super_admin_removes_superuser_flags_and_access(self):
        user = User.objects.create_superuser(
            username="demoted-root",
            email="demoted-root@example.com",
            password="test-password",
        )
        user.role = User.Role.ADMIN
        user.save(update_fields={"role"})

        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.has_perm("future_app.future_permission"))
        self.assertFalse(user.has_module_perms("future_app"))

    def test_regular_user_cannot_be_created_as_super_admin(self):
        with self.assertRaisesMessage(ValueError, "create_superuser"):
            User.objects.create_user(
                username="not-root",
                role=User.Role.SUPER_ADMIN,
            )
