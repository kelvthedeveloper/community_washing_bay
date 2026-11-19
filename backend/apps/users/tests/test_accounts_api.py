from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.users.models import User


class UserAccountManagementApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="business-owner",
            email="owner@example.com",
            password="Owner$Password-2026",
            role=User.Role.ADMIN,
        )
        self.manager = User.objects.create_user(
            username="wash-manager",
            email="wash-manager@example.com",
            password="Manager$Password-2026",
            role=User.Role.MANAGER,
        )
        self.super_admin = User.objects.create_superuser(
            username="system-owner",
            email="system-owner@example.com",
            password="Super$Password-2026",
        )
        self.client = APIClient()

    def account_payload(self, username, email, role=User.Role.MANAGER):
        return {
            "username": username,
            "email": email,
            "first_name": "Bay",
            "last_name": "Staff",
            "role": role,
            "password": "Account$Password-2026",
            "password_confirmation": "Account$Password-2026",
        }

    def test_admin_can_create_manager_without_exposing_password(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/users/",
            self.account_payload("new-manager", "new-manager@example.com"),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], User.Role.MANAGER)
        self.assertNotIn("password", response.data)
        self.assertNotIn("is_superuser", response.data)
        self.assertTrue(
            User.objects.get(username="new-manager").check_password(
                "Account$Password-2026"
            )
        )

    def test_admin_cannot_create_or_manage_admin_accounts(self):
        self.client.force_authenticate(user=self.admin)
        create_response = self.client.post(
            "/api/v1/users/",
            self.account_payload(
                "another-owner",
                "another-owner@example.com",
                role=User.Role.ADMIN,
            ),
            format="json",
        )
        super_admin_create_response = self.client.post(
            "/api/v1/users/",
            self.account_payload(
                "extra-root",
                "extra-root@example.com",
                role=User.Role.SUPER_ADMIN,
            ),
            format="json",
        )
        retrieve_response = self.client.get(f"/api/v1/users/{self.super_admin.pk}/")

        self.assertEqual(create_response.status_code, 403)
        self.assertEqual(super_admin_create_response.status_code, 403)
        self.assertEqual(retrieve_response.status_code, 404)

    def test_email_addresses_are_unique_case_insensitively(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/users/",
            self.account_payload("duplicate-email", "OWNER@EXAMPLE.COM"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_admin_can_manage_manager_accounts(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            f"/api/v1/users/{self.manager.pk}/",
            {"first_name": "Updated"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.manager.refresh_from_db()
        self.assertEqual(self.manager.first_name, "Updated")

    def test_admin_cannot_change_a_managers_role(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            f"/api/v1/users/{self.manager.pk}/",
            {"role": User.Role.ADMIN},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.manager.refresh_from_db()
        self.assertEqual(self.manager.role, User.Role.MANAGER)

    def test_manager_cannot_manage_user_accounts(self):
        self.client.force_authenticate(user=self.manager)

        response = self.client.get("/api/v1/users/")

        self.assertEqual(response.status_code, 403)

    def test_super_admin_can_create_and_manage_admin_accounts(self):
        self.client.force_authenticate(user=self.super_admin)
        create_response = self.client.post(
            "/api/v1/users/",
            self.account_payload(
                "new-owner",
                "new-owner@example.com",
                role=User.Role.ADMIN,
            ),
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        created_admin = User.objects.get(username="new-owner")
        update_response = self.client.patch(
            f"/api/v1/users/{created_admin.pk}/",
            {"first_name": "Business"},
            format="json",
        )

        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["role"], User.Role.ADMIN)
        self.assertNotIn("password", update_response.data)

    def test_super_admin_can_create_another_super_admin(self):
        self.client.force_authenticate(user=self.super_admin)

        response = self.client.post(
            "/api/v1/users/",
            self.account_payload(
                "second-root",
                "second-root@example.com",
                role=User.Role.SUPER_ADMIN,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created_user = User.objects.get(username="second-root")
        self.assertEqual(created_user.role, User.Role.SUPER_ADMIN)
        self.assertTrue(created_user.is_superuser)

    def test_super_admin_cannot_change_or_deactivate_own_role(self):
        self.client.force_authenticate(user=self.super_admin)
        role_response = self.client.patch(
            f"/api/v1/users/{self.super_admin.pk}/",
            {"role": User.Role.ADMIN},
            format="json",
        )
        deactivate_response = self.client.patch(
            f"/api/v1/users/{self.super_admin.pk}/",
            {"is_active": False},
            format="json",
        )

        self.assertEqual(role_response.status_code, 403)
        self.assertEqual(deactivate_response.status_code, 403)
        self.super_admin.refresh_from_db()
        self.assertEqual(self.super_admin.role, User.Role.SUPER_ADMIN)
        self.assertTrue(self.super_admin.is_active)
