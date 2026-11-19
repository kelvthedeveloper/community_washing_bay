from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from apps.users.models import User


class LoginSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields[self.username_field].label = "Username or email"
        self.fields[self.username_field].max_length = 254
        self.fields["password"].trim_whitespace = False
        self.fields["password"].max_length = 128

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["auth_token_version"] = user.auth_token_version
        return token


class TokenPairResponseSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=4096,
    )

    def validate_refresh(self, value):
        try:
            token = RefreshToken(value)
        except TokenError as exc:
            raise serializers.ValidationError(
                "Invalid or expired refresh token."
            ) from exc

        request_user_id = str(self.context["request"].user.pk)
        token_user_id = str(token.get("user_id", ""))
        if token_user_id != request_user_id:
            raise PermissionDenied("Refresh token does not belong to this user.")
        return token

    def save(self, **kwargs):
        self.validated_data["refresh"].blacklist()


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=128,
    )
    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=128,
    )
    confirm_new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=128,
    )

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError(
                {"old_password": "The current password is incorrect."}
            )
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError(
                {"confirm_new_password": "The new passwords do not match."}
            )
        if user.check_password(attrs["new_password"]):
            raise serializers.ValidationError(
                {"new_password": "Choose a password different from the current one."}
            )
        try:
            password_validation.validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"new_password": exc.messages}
            ) from exc
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        with transaction.atomic():
            user.set_password(self.validated_data["new_password"])
            user.auth_token_version += 1
            user.save(update_fields={"password", "auth_token_version"})
            for token in OutstandingToken.objects.filter(user=user).iterator():
                BlacklistedToken.objects.get_or_create(token=token)
        return user


class PasswordChangeResponseSerializer(serializers.Serializer):
    detail = serializers.CharField(read_only=True)
