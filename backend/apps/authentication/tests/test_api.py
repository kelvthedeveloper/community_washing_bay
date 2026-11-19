from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from apps.users.models import User


class AuthenticationApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="bay-manager",
            email="manager@example.com",
            password="Original$Password-2026",
        )
        self.client = APIClient()

    def login(self, identifier="bay-manager"):
        return self.client.post(
            "/api/v1/auth/token/",
            {
                "username": identifier,
                "password": "Original$Password-2026",
            },
            format="json",
        )

    def test_login_accepts_username_or_email(self):
        for identifier in ("bay-manager", "MANAGER@EXAMPLE.COM"):
            with self.subTest(identifier=identifier):
                cache.clear()
                response = self.login(identifier)

                self.assertEqual(response.status_code, 200)
                self.assertIn("access", response.data)
                self.assertIn("refresh", response.data)
                access_token = AccessToken(response.data["access"])
                self.assertIn("auth_token_version", access_token)
                self.assertNotIn("hash_password", access_token)

    def test_login_rejects_invalid_password(self):
        response = self.client.post(
            "/api/v1/auth/token/",
            {"username": "bay-manager", "password": "wrong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, 401)

    def test_login_is_throttled(self):
        for _ in range(5):
            response = self.client.post(
                "/api/v1/auth/token/",
                {"username": "bay-manager", "password": "wrong-password"},
                format="json",
            )
            self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/v1/auth/token/",
            {"username": "bay-manager", "password": "wrong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, 429)

    def test_refresh_rotates_and_blacklists_the_previous_token(self):
        login_response = self.login()
        old_refresh = login_response.data["refresh"]

        response = self.client.post(
            "/api/v1/auth/token/refresh/",
            {"refresh": old_refresh},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        with self.assertRaises(TokenError):
            RefreshToken(old_refresh)

    def test_current_user_never_returns_password_or_privilege_fields(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], str(self.user.pk))
        self.assertEqual(response.data["role"], User.Role.MANAGER)
        for sensitive_field in (
            "password",
            "is_superuser",
            "is_staff",
            "groups",
            "user_permissions",
        ):
            self.assertNotIn(sensitive_field, response.data)

    def test_current_user_requires_authentication(self):
        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, 401)

    def test_current_user_endpoint_does_not_accept_role_updates(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            "/api/v1/auth/me/",
            {"role": User.Role.SUPER_ADMIN},
            format="json",
        )

        self.assertEqual(response.status_code, 405)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.MANAGER)

    def test_logout_blacklists_only_the_authenticated_users_refresh_token(self):
        refresh = RefreshToken.for_user(self.user)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/auth/token/logout/",
            {"refresh": str(refresh)},
            format="json",
        )

        self.assertEqual(response.status_code, 204)
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()
        )
        with self.assertRaises(TokenError):
            RefreshToken(str(refresh))

    def test_logout_rejects_another_users_refresh_token(self):
        other_user = User.objects.create_user(
            username="another-manager",
            email="another@example.com",
            password="Other$Password-2026",
        )
        refresh = RefreshToken.for_user(other_user)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/auth/token/logout/",
            {"refresh": str(refresh)},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()
        )

    def test_logout_requires_authentication(self):
        refresh = RefreshToken.for_user(self.user)

        response = self.client.post(
            "/api/v1/auth/token/logout/",
            {"refresh": str(refresh)},
            format="json",
        )

        self.assertEqual(response.status_code, 401)

    def test_password_change_validates_and_revokes_refresh_tokens(self):
        login_response = self.login()
        access = login_response.data["access"]
        refresh = RefreshToken(login_response.data["refresh"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post(
            "/api/v1/auth/password/change/",
            {
                "old_password": "Original$Password-2026",
                "new_password": "New$SecurePassword-2026",
                "confirm_new_password": "New$SecurePassword-2026",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("New$SecurePassword-2026"))
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()
        )
        self.assertNotIn("password", response.data)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_password_change_rejects_mismatch_and_wrong_old_password(self):
        self.client.force_authenticate(user=self.user)
        mismatch_response = self.client.post(
            "/api/v1/auth/password/change/",
            {
                "old_password": "Original$Password-2026",
                "new_password": "New$SecurePassword-2026",
                "confirm_new_password": "Different$Password-2026",
            },
            format="json",
        )
        wrong_old_response = self.client.post(
            "/api/v1/auth/password/change/",
            {
                "old_password": "wrong-password",
                "new_password": "New$SecurePassword-2026",
                "confirm_new_password": "New$SecurePassword-2026",
            },
            format="json",
        )

        self.assertEqual(mismatch_response.status_code, 400)
        self.assertEqual(wrong_old_response.status_code, 400)
        self.assertTrue(self.user.check_password("Original$Password-2026"))

    def test_password_change_rejects_passwords_that_fail_validators(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/v1/auth/password/change/",
            {
                "old_password": "Original$Password-2026",
                "new_password": "short",
                "confirm_new_password": "short",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.user.check_password("Original$Password-2026"))
