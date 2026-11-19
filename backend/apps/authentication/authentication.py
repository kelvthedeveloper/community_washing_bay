from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class VersionedJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.authentication.authentication.VersionedJWTAuthentication"
    name = "jwtAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }


class VersionedJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if validated_token.get("auth_token_version") != user.auth_token_version:
            raise AuthenticationFailed(
                "Token is no longer valid.",
                code="token_not_valid",
            )
        return user
