from django.urls import path

from apps.authentication.views import (
    ChangePasswordView,
    CurrentUserView,
    LoginView,
    LogoutView,
    RefreshTokenView,
)


urlpatterns = [
    path("token/", LoginView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", RefreshTokenView.as_view(), name="token_refresh"),
    path("token/logout/", LogoutView.as_view(), name="token_blacklist"),
    path("me/", CurrentUserView.as_view(), name="current_user"),
    path(
        "password/change/",
        ChangePasswordView.as_view(),
        name="change_password",
    ),
]
