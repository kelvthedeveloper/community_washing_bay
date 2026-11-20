from .base import *  # noqa: F403
from django.core.exceptions import ImproperlyConfigured

DEBUG = False
if "supabase" not in DATABASES:
    raise ImproperlyConfigured("Production DATABASE_URL must be configured.")
DATABASES["default"]["NAME"] = env(
    "LOCAL_DATABASE_PATH",
    default="/var/lib/community-washing-bay/community_washing_bay.sqlite3",
)
DATABASES["supabase"].setdefault("OPTIONS", {})
database_sslmode = DATABASES["supabase"]["OPTIONS"].get("sslmode", "require")
if database_sslmode not in {"require", "verify-ca", "verify-full"}:
    raise ImproperlyConfigured(
        "Production DATABASE_URL must use PostgreSQL sslmode=require, "
        "verify-ca, or verify-full."
    )
DATABASES["supabase"]["OPTIONS"]["sslmode"] = database_sslmode
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

if env.bool("DJANGO_TRUST_X_FORWARDED_PROTO", default=False):  # noqa: F405
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
