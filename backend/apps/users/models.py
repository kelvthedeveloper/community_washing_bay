import uuid

from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models
from django.db.models.functions import Lower


class UserRole(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
    ADMIN = "ADMIN", "Admin"
    MANAGER = "MANAGER", "Manager"


class UserManager(DjangoUserManager):
    use_in_migrations = True

    def create_user(self, username, email=None, password=None, **extra_fields):
        role = extra_fields.setdefault("role", self.model.Role.MANAGER)
        if role not in self.model.Role.values:
            raise ValueError(f"Invalid business role: {role}")
        if role == self.model.Role.SUPER_ADMIN:
            raise ValueError("Create super admins with create_superuser().")
        if extra_fields.get("is_superuser"):
            raise ValueError("Create super admins with create_superuser().")
        email = self._normalize_required_email(email)
        return super().create_user(
            username,
            email=email,
            password=password,
            **extra_fields,
        )

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        role = extra_fields.setdefault("role", self.model.Role.SUPER_ADMIN)
        if role != self.model.Role.SUPER_ADMIN:
            raise ValueError("A Django superuser must have the SUPER_ADMIN role.")
        email = self._normalize_required_email(email)
        return super().create_superuser(
            username,
            email=email,
            password=password,
            **extra_fields,
        )

    def _normalize_required_email(self, email):
        if not email or not email.strip():
            raise ValueError("Users must have an email address.")
        return self.normalize_email(email.strip()).lower()


class User(AbstractUser):
    Role = UserRole

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(blank=False)
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.MANAGER,
    )
    auth_token_version = models.PositiveIntegerField(default=0, editable=False)

    objects = UserManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                name="users_user_email_ci_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(role__in=UserRole.values),
                name="users_user_valid_role",
            ),
        ]

    @property
    def has_unrestricted_access(self) -> bool:
        return self.is_active and self.role == self.Role.SUPER_ADMIN

    def has_perm(self, perm, obj=None):
        if self.has_unrestricted_access:
            return True
        return super().has_perm(perm, obj)

    def has_perms(self, perm_list, obj=None):
        if self.has_unrestricted_access:
            return True
        return super().has_perms(perm_list, obj)

    def has_module_perms(self, app_label):
        if self.has_unrestricted_access:
            return True
        return super().has_module_perms(app_label)

    def save(self, *args, **kwargs):
        is_super_admin = self.role == self.Role.SUPER_ADMIN
        self.is_staff = is_super_admin
        self.is_superuser = is_super_admin

        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {
                "is_staff",
                "is_superuser",
            }

        return super().save(*args, **kwargs)
