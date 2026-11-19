from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.configuration.models import (
    CommissionSetting,
    ExpenseCategory,
    InventoryCategory,
    Service,
    ServicePricing,
    VehicleType,
)
from apps.users.models import User


class BusinessConfigurationApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="configuration-admin",
            email="configuration-admin@example.com",
            password="Admin$Password-2026",
            role=User.Role.ADMIN,
        )
        self.manager = User.objects.create_user(
            username="configuration-manager",
            email="configuration-manager@example.com",
            password="Manager$Password-2026",
            role=User.Role.MANAGER,
        )
        self.super_admin = User.objects.create_superuser(
            username="configuration-super-admin",
            email="configuration-super-admin@example.com",
            password="Super$Password-2026",
        )
        self.vehicle_type = VehicleType.objects.create(name="fixture-type-alpha")
        self.service = Service.objects.create(name="fixture-service-alpha")
        self.effective_date = date(2026, 1, 15)
        self.pricing = ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.service,
            price=Decimal("23.47"),
            effective_date=self.effective_date,
        )
        self.commission = CommissionSetting.objects.create(
            commission_percentage=Decimal("17.35"),
            effective_date=self.effective_date,
        )
        self.client = APIClient()

    def authenticate_as(self, user):
        self.client.force_authenticate(user=user)

    def pricing_payload(self, effective_date=None, price="23.47"):
        return {
            "vehicle_type": str(self.vehicle_type.pk),
            "service": str(self.service.pk),
            "price": price,
            "effective_date": (effective_date or self.effective_date).isoformat(),
        }

    def test_manager_can_view_configuration_but_cannot_change_it(self):
        self.authenticate_as(self.manager)

        vehicle_types_response = self.client.get(
            "/api/v1/configuration/vehicle-types/"
        )
        pricing_response = self.client.get(
            "/api/v1/configuration/service-pricing/"
        )
        commission_response = self.client.get(
            "/api/v1/configuration/commission-settings/"
        )
        create_response = self.client.post(
            "/api/v1/configuration/vehicle-types/",
            {"name": "fixture-type-manager"},
            format="json",
        )
        pricing_update_response = self.client.patch(
            f"/api/v1/configuration/service-pricing/{self.pricing.pk}/",
            {"is_active": False},
            format="json",
        )
        commission_delete_response = self.client.delete(
            f"/api/v1/configuration/commission-settings/{self.commission.pk}/"
        )

        self.assertEqual(vehicle_types_response.status_code, 200)
        self.assertEqual(pricing_response.status_code, 200)
        self.assertEqual(commission_response.status_code, 200)
        self.assertEqual(create_response.status_code, 403)
        self.assertEqual(pricing_update_response.status_code, 403)
        self.assertEqual(commission_delete_response.status_code, 403)
        self.assertTrue(self.commission.is_active)

    def test_admin_can_create_and_soft_delete_configuration(self):
        self.authenticate_as(self.admin)
        create_response = self.client.post(
            "/api/v1/configuration/expense-categories/",
            {
                "name": "fixture-expense-category",
                "description": "Configuration test record",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        category_id = create_response.data["id"]

        delete_response = self.client.delete(
            f"/api/v1/configuration/expense-categories/{category_id}/"
        )

        self.assertEqual(delete_response.status_code, 204)
        category = ExpenseCategory.objects.get(pk=category_id)
        self.assertFalse(category.is_active)

    def test_super_admin_can_manage_configuration(self):
        self.authenticate_as(self.super_admin)

        response = self.client.post(
            "/api/v1/configuration/inventory-categories/",
            {"name": "fixture-inventory-category"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            InventoryCategory.objects.filter(
                pk=response.data["id"],
                is_active=True,
            ).exists()
        )

    def test_category_names_are_unique_without_case_sensitivity(self):
        self.authenticate_as(self.admin)
        first_response = self.client.post(
            "/api/v1/configuration/inventory-categories/",
            {"name": "fixture-inventory-category"},
            format="json",
        )
        duplicate_response = self.client.post(
            "/api/v1/configuration/inventory-categories/",
            {"name": "FIXTURE-INVENTORY-CATEGORY"},
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(duplicate_response.status_code, 400)

    def test_configuration_requires_authentication(self):
        response = self.client.get("/api/v1/configuration/services/")

        self.assertEqual(response.status_code, 401)

    def test_name_filters_search_and_pagination_are_available(self):
        self.authenticate_as(self.admin)
        VehicleType.objects.create(name="fixture-type-beta", is_active=False)
        VehicleType.objects.create(name="fixture-type-gamma")

        inactive_response = self.client.get(
            "/api/v1/configuration/vehicle-types/?is_active=false"
        )
        search_response = self.client.get(
            "/api/v1/configuration/vehicle-types/?search=gamma"
        )
        paginated_response = self.client.get(
            "/api/v1/configuration/vehicle-types/?page_size=1"
        )

        self.assertEqual(inactive_response.status_code, 200)
        self.assertEqual(inactive_response.data["count"], 1)
        self.assertEqual(
            inactive_response.data["results"][0]["name"],
            "fixture-type-beta",
        )
        self.assertEqual(search_response.data["count"], 1)
        self.assertEqual(
            search_response.data["results"][0]["name"],
            "fixture-type-gamma",
        )
        self.assertEqual(paginated_response.data["count"], 3)
        self.assertEqual(len(paginated_response.data["results"]), 1)
        self.assertIsNotNone(paginated_response.data["next"])

    def test_pricing_history_allows_new_effective_dates_and_rejects_duplicates(self):
        self.authenticate_as(self.admin)
        next_date = self.effective_date + timedelta(days=1)

        new_price_response = self.client.post(
            "/api/v1/configuration/service-pricing/",
            self.pricing_payload(effective_date=next_date, price="29.81"),
            format="json",
        )
        duplicate_response = self.client.post(
            "/api/v1/configuration/service-pricing/",
            self.pricing_payload(),
            format="json",
        )
        history_response = self.client.get(
            "/api/v1/configuration/service-pricing/"
            f"?vehicle_type={self.vehicle_type.pk}"
            f"&effective_date__gte={self.effective_date.isoformat()}"
        )

        self.assertEqual(new_price_response.status_code, 201)
        self.assertEqual(duplicate_response.status_code, 400)
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.data["count"], 2)

    def test_pricing_history_cannot_be_overwritten(self):
        self.authenticate_as(self.admin)

        response = self.client.patch(
            f"/api/v1/configuration/service-pricing/{self.pricing.pk}/",
            {"price": "31.25"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.pricing.refresh_from_db()
        self.assertEqual(self.pricing.price, Decimal("23.47"))

    def test_pricing_duplicate_combination_is_rejected_by_database(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ServicePricing.objects.create(
                    vehicle_type=self.vehicle_type,
                    service=self.service,
                    price=Decimal("31.25"),
                    effective_date=self.effective_date,
                )

    def test_deleting_a_referenced_vehicle_type_deactivates_it(self):
        self.authenticate_as(self.admin)

        response = self.client.delete(
            f"/api/v1/configuration/vehicle-types/{self.vehicle_type.pk}/"
        )

        self.assertEqual(response.status_code, 204)
        self.vehicle_type.refresh_from_db()
        self.pricing.refresh_from_db()
        self.assertFalse(self.vehicle_type.is_active)
        self.assertTrue(
            ServicePricing.objects.filter(
                pk=self.pricing.pk,
                vehicle_type=self.vehicle_type,
            ).exists()
        )

    def test_commission_percentage_is_bounded_and_history_is_immutable(self):
        self.authenticate_as(self.admin)
        next_date = self.effective_date + timedelta(days=1)

        below_range_response = self.client.post(
            "/api/v1/configuration/commission-settings/",
            {
                "commission_percentage": "-0.01",
                "effective_date": next_date.isoformat(),
            },
            format="json",
        )
        above_range_response = self.client.post(
            "/api/v1/configuration/commission-settings/",
            {
                "commission_percentage": "100.01",
                "effective_date": next_date.isoformat(),
            },
            format="json",
        )
        new_setting_response = self.client.post(
            "/api/v1/configuration/commission-settings/",
            {
                "commission_percentage": "41.20",
                "effective_date": next_date.isoformat(),
            },
            format="json",
        )
        duplicate_response = self.client.post(
            "/api/v1/configuration/commission-settings/",
            {
                "commission_percentage": "41.20",
                "effective_date": next_date.isoformat(),
            },
            format="json",
        )
        update_response = self.client.patch(
            f"/api/v1/configuration/commission-settings/{self.commission.pk}/",
            {"commission_percentage": "41.20"},
            format="json",
        )

        self.assertEqual(below_range_response.status_code, 400)
        self.assertEqual(above_range_response.status_code, 400)
        self.assertEqual(new_setting_response.status_code, 201)
        self.assertEqual(duplicate_response.status_code, 400)
        self.assertEqual(update_response.status_code, 400)
        self.commission.refresh_from_db()
        self.assertEqual(
            self.commission.commission_percentage,
            Decimal("17.35"),
        )

    def test_commission_percentage_boundaries_are_valid(self):
        self.authenticate_as(self.admin)

        zero_response = self.client.post(
            "/api/v1/configuration/commission-settings/",
            {
                "commission_percentage": "0.00",
                "effective_date": (self.effective_date + timedelta(days=2)).isoformat(),
            },
            format="json",
        )
        maximum_response = self.client.post(
            "/api/v1/configuration/commission-settings/",
            {
                "commission_percentage": "100.00",
                "effective_date": (self.effective_date + timedelta(days=3)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(zero_response.status_code, 201)
        self.assertEqual(maximum_response.status_code, 201)

    def test_commission_settings_are_unique_by_effective_date_in_database(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CommissionSetting.objects.create(
                    commission_percentage=Decimal("32.10"),
                    effective_date=self.effective_date,
                )
