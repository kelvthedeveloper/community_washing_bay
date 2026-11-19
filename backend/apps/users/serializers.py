from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


class UserReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "date_joined",
        )
        read_only_fields = fields


class UserCreateSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(
        choices=User.Role.choices,
        default=User.Role.MANAGER,
    )
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=128,
    )
    password_confirmation = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=128,
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "password",
            "password_confirmation",
        )
        read_only_fields = ("id",)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "A user with this email address already exists."
            )
        return email

    def validate_role(self, role):
        if (
            role != User.Role.MANAGER
            and not self.context["request"].user.has_unrestricted_access
        ):
            raise PermissionDenied(
                "Only a Super Admin can create Admin or Super Admin accounts."
            )
        return role

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "The passwords do not match."}
            )
        candidate = User(
            username=attrs["username"],
            email=attrs["email"],
        )
        try:
            password_validation.validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"password": exc.messages}
            ) from exc
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirmation")
        password = validated_data.pop("password")
        role = validated_data.get("role")
        if role == User.Role.SUPER_ADMIN:
            return User.objects.create_superuser(
                password=password,
                **validated_data,
            )
        return User.objects.create_user(password=password, **validated_data)


class UserManagementSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "date_joined",
        )
        read_only_fields = ("id", "date_joined")

    def validate_email(self, value):
        email = value.strip().lower()
        users = User.objects.filter(email__iexact=email)
        if self.instance is not None:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError(
                "A user with this email address already exists."
            )
        return email

    def validate_role(self, role):
        if self.instance is None or role == self.instance.role:
            return role
        request = self.context["request"]
        if request.user.pk == self.instance.pk:
            raise PermissionDenied("You cannot change your own role.")
        if not request.user.has_unrestricted_access:
            raise PermissionDenied("Only a Super Admin can change account roles.")
        return role

    def validate_is_active(self, is_active):
        if (
            not is_active
            and self.instance is not None
            and self.context["request"].user.pk == self.instance.pk
        ):
            raise PermissionDenied("You cannot deactivate your own account.")
        return is_active
