import django_filters

from apps.expenses.models import Expense


class ExpenseFilter(django_filters.FilterSet):
    is_cancelled = django_filters.BooleanFilter(method="filter_cancelled")
    amount__gte = django_filters.NumberFilter(field_name="amount", lookup_expr="gte")
    amount__lte = django_filters.NumberFilter(field_name="amount", lookup_expr="lte")

    class Meta:
        model = Expense
        fields = {
            "category": ["exact"],
            "payment_method": ["exact"],
            "expense_date": ["exact", "gte", "lte"],
        }

    def filter_cancelled(self, queryset, _name, is_cancelled):
        return queryset.filter(cancelled_at__isnull=not is_cancelled)
