from datetime import date
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.configuration.models import InventoryCategory
from apps.inventory.models import (
    InventoryProduct,
    InventoryPurchase,
    StockMovement,
    Supplier,
)
from apps.users.models import User


class InventoryApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="inventory-admin",
            email="inventory-admin@example.com",
            password="Admin$Password-2026",
            role=User.Role.ADMIN,
        )
        self.manager = User.objects.create_user(
            username="inventory-manager",
            email="inventory-manager@example.com",
            password="Manager$Password-2026",
            role=User.Role.MANAGER,
        )
        self.super_admin = User.objects.create_superuser(
            username="inventory-super-admin",
            email="inventory-super-admin@example.com",
            password="Super$Password-2026",
        )
        self.category = InventoryCategory.objects.create(
            name="test-chemical-category",
        )
        self.supplier = Supplier.objects.create(
            name="Test Supply Company",
            phone_number="+1 206 555 0180",
        )
        self.product = InventoryProduct.objects.create(
            name="Test Concentrated Shampoo",
            sku="SHAMPOO-TEST",
            category=self.category,
            unit_label="L",
            low_stock_threshold=Decimal("3.000"),
        )
        self.client = APIClient()

    def authenticate_as(self, user):
        self.client.force_authenticate(user=user)

    def purchase_payload(
        self,
        *,
        quantity="10.000",
        unit_cost="4.00",
        product_id=None,
        purchase_date=None,
    ):
        return {
            "supplier": str(self.supplier.pk),
            "purchase_date": (purchase_date or timezone.localdate()).isoformat(),
            "invoice_number": "INV-TEST-1",
            "notes": "Inventory test purchase",
            "lines": [
                {
                    "product": str(product_id or self.product.pk),
                    "quantity": quantity,
                    "unit_cost": unit_cost,
                }
            ],
        }

    def create_purchase(self, **kwargs):
        return self.client.post(
            "/api/v1/inventory/purchases/",
            self.purchase_payload(**kwargs),
            format="json",
        )

    def test_inventory_requires_authentication_and_manager_cannot_manage_catalog(self):
        anonymous = self.client.get("/api/v1/inventory/products/")
        self.assertEqual(anonymous.status_code, 401)

        self.authenticate_as(self.manager)
        list_response = self.client.get("/api/v1/inventory/products/")
        create_response = self.client.post(
            "/api/v1/inventory/products/",
            {
                "name": "Manager-created item",
                "category": str(self.category.pk),
                "unit_label": "bottle",
            },
            format="json",
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(create_response.status_code, 403)

        self.authenticate_as(self.admin)
        create_response = self.client.post(
            "/api/v1/inventory/products/",
            {
                "name": "Admin-created item",
                "category": str(self.category.pk),
                "unit_label": "bottle",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.data["stock_on_hand"], "0.000")

    def test_manager_can_record_purchases_and_usage_with_weighted_average_costing(self):
        self.authenticate_as(self.manager)
        first_purchase = self.create_purchase(quantity="10.000", unit_cost="4.00")
        second_purchase = self.create_purchase(quantity="10.000", unit_cost="6.00")
        usage_response = self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/usage/",
            {"quantity": "4.000", "reason": "Daily washing operations"},
            format="json",
        )

        self.assertEqual(first_purchase.status_code, 201)
        self.assertEqual(second_purchase.status_code, 201)
        self.assertEqual(first_purchase.data["total_cost"], "40.00")
        self.assertEqual(second_purchase.data["total_cost"], "60.00")
        self.assertEqual(usage_response.status_code, 201)
        self.assertEqual(usage_response.data["quantity"], "-4.000")
        self.assertEqual(usage_response.data["unit_cost_snapshot"], "5.000000")
        self.assertEqual(usage_response.data["value_change"], "-20.00")

        third_purchase = self.create_purchase(quantity="4.000", unit_cost="7.00")
        product_response = self.client.get(
            f"/api/v1/inventory/products/{self.product.pk}/"
        )

        self.assertEqual(third_purchase.status_code, 201)
        self.assertEqual(product_response.status_code, 200)
        self.assertEqual(product_response.data["stock_on_hand"], "20.000")
        self.assertEqual(product_response.data["stock_value"], "108.00")
        self.assertEqual(product_response.data["average_unit_cost"], "5.400000")
        self.assertEqual(InventoryPurchase.objects.count(), 3)
        self.assertEqual(StockMovement.objects.count(), 4)

    def test_usage_cannot_overdraw_stock_and_failed_transaction_keeps_history_unchanged(self):
        self.authenticate_as(self.manager)
        self.create_purchase(quantity="2.000", unit_cost="3.00")

        response = self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/usage/",
            {"quantity": "2.001", "reason": "Overdraw attempt"},
            format="json",
        )
        product_response = self.client.get(
            f"/api/v1/inventory/products/{self.product.pk}/"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("quantity", response.data)
        self.assertEqual(product_response.data["stock_on_hand"], "2.000")
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_adjustments_are_admin_only_and_record_signed_movement_entries(self):
        self.authenticate_as(self.manager)
        self.create_purchase(quantity="5.000", unit_cost="10.00")
        manager_adjustment = self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/adjustment/",
            {"quantity": "1.000", "reason": "Manager adjustment"},
            format="json",
        )
        self.assertEqual(manager_adjustment.status_code, 403)

        self.authenticate_as(self.admin)
        positive = self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/adjustment/",
            {"quantity": "2.000", "reason": "Physical count surplus"},
            format="json",
        )
        negative = self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/adjustment/",
            {"quantity": "-1.000", "reason": "Damaged stock"},
            format="json",
        )
        overdraw = self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/adjustment/",
            {"quantity": "-7.000", "reason": "Invalid count"},
            format="json",
        )

        self.assertEqual(positive.status_code, 201)
        self.assertEqual(positive.data["value_change"], "20.00")
        self.assertEqual(negative.status_code, 201)
        self.assertEqual(negative.data["value_change"], "-10.00")
        self.assertEqual(overdraw.status_code, 400)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.Type.ADJUSTMENT
            ).count(),
            2,
        )

    def test_low_stock_alerts_and_valuation_and_movement_reports(self):
        self.authenticate_as(self.admin)
        self.create_purchase(quantity="5.000", unit_cost="4.00")
        self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/usage/",
            {"quantity": "3.000", "reason": "Used on completed jobs"},
            format="json",
        )

        low_stock_response = self.client.get(
            "/api/v1/inventory/products/low-stock/"
        )
        valuation_response = self.client.get(
            f"/api/v1/inventory/reports/valuation/?as_of={timezone.localdate().isoformat()}"
        )
        movement_report = self.client.get(
            "/api/v1/inventory/reports/movements/"
            f"?start_date={timezone.localdate().replace(day=1).isoformat()}"
            f"&end_date={timezone.localdate().isoformat()}"
        )

        self.assertEqual(low_stock_response.status_code, 200)
        self.assertEqual(low_stock_response.data["count"], 1)
        self.assertTrue(low_stock_response.data["results"][0]["is_low_stock"])
        self.assertEqual(valuation_response.status_code, 200)
        self.assertEqual(valuation_response.data["total_stock_value"], "8.00")
        self.assertEqual(valuation_response.data["low_stock_count"], 1)
        self.assertEqual(movement_report.status_code, 200)
        self.assertEqual(movement_report.data["movement_count"], 2)
        self.assertEqual(movement_report.data["total_purchase_cost"], "20.00")
        self.assertEqual(movement_report.data["total_usage_cost"], "12.00")

    def test_purchase_rejects_duplicate_products_and_inactive_suppliers(self):
        self.authenticate_as(self.manager)
        payload = self.purchase_payload()
        payload["lines"].append(payload["lines"][0])
        duplicate_response = self.client.post(
            "/api/v1/inventory/purchases/",
            payload,
            format="json",
        )
        self.supplier.is_active = False
        self.supplier.save(update_fields={"is_active", "updated_at"})
        inactive_response = self.create_purchase()

        self.assertEqual(duplicate_response.status_code, 400)
        self.assertEqual(inactive_response.status_code, 400)
        self.assertEqual(InventoryPurchase.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_admin_can_manage_suppliers_and_deactivation_preserves_records(self):
        self.authenticate_as(self.manager)
        manager_create = self.client.post(
            "/api/v1/inventory/suppliers/",
            {"name": "Manager Supplier"},
            format="json",
        )
        self.assertEqual(manager_create.status_code, 403)

        self.authenticate_as(self.admin)
        create = self.client.post(
            "/api/v1/inventory/suppliers/",
            {"name": "New Supplier", "email": "new-supplier@example.com"},
            format="json",
        )
        deactivate = self.client.delete(
            f"/api/v1/inventory/suppliers/{self.supplier.pk}/"
        )

        self.assertEqual(create.status_code, 201)
        self.assertEqual(deactivate.status_code, 204)
        self.assertFalse(Supplier.objects.get(pk=self.supplier.pk).is_active)

    def test_super_admin_has_unrestricted_inventory_access(self):
        self.authenticate_as(self.super_admin)
        response = self.client.post(
            f"/api/v1/inventory/products/{self.product.pk}/adjustment/",
            {
                "quantity": "1.000",
                "unit_cost": "2.00",
                "reason": "Super Admin opening balance",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["recorded_by_name"], "inventory-super-admin")

    def test_unit_of_measure_cannot_change_after_a_movement(self):
        self.authenticate_as(self.manager)
        self.create_purchase()
        self.authenticate_as(self.admin)
        response = self.client.patch(
            f"/api/v1/inventory/products/{self.product.pk}/",
            {"unit_label": "bottle"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("unit_label", response.data)
