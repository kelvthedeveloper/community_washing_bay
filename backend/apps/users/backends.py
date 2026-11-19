from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class UsernameOrEmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        user_model = get_user_model()
        if username is None:
            username = kwargs.get(user_model.USERNAME_FIELD)
        if username is None or password is None:
            return None

        try:
            user = user_model._default_manager.get_by_natural_key(username)
        except user_model.DoesNotExist:
            try:
                user = user_model._default_manager.get(email__iexact=username)
            except user_model.DoesNotExist:
                user = None
            except user_model.MultipleObjectsReturned:
                return None

        if user is None:
            user_model().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
