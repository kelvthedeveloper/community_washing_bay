from django.urls import include, path
from rest_framework.permissions import AllowAny
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


urlpatterns = [
    path("auth/", include("apps.authentication.urls")),
    path("configuration/", include("apps.configuration.urls")),
    path("", include("apps.workers.urls")),
    path("", include("apps.users.urls")),
    path(
        "schema/",
        SpectacularAPIView.as_view(permission_classes=[AllowAny]),
        name="api-schema",
    ),
    path(
        "docs/",
        SpectacularSwaggerView.as_view(
            url_name="api-schema", permission_classes=[AllowAny]
        ),
        name="api-docs",
    ),
    path(
        "redoc/",
        SpectacularRedocView.as_view(
            url_name="api-schema", permission_classes=[AllowAny]
        ),
        name="api-redoc",
    ),
]
