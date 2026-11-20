from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.configuration.models import (
    CommissionSetting,
    ExpenseCategory,
    InventoryCategory,
    Service,
    ServicePricing,
    VehicleType,
)
from apps.expenses.models import Expense
from apps.inventory.models import InventoryProduct, Supplier
from apps.inventory.services import record_inventory_purchase, record_inventory_usage
from apps.jobs.models import Job, JobPayment
from apps.users.models import User
from apps.workers.models import CommissionPayment, Worker


class OwnerReportApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="report-admin",
            email="report-admin@example.com",
            password="Admin$Password-2026",
            role=User.Role.ADMIN,
        )
        self.manager = User.objects.create_user(
            username="report-manager",
            email="report-manager@example.com",
            password="Manager$Password-2026",
            role=User.Role.MANAGER,
        )
        self.super_admin = User.objects.create_superuser(
            username="report-super-admin",
            email="report-super-admin@example.com",
            password="Super$Password-2026",
        )
        self.vehicle_type = VehicleType.objects.create(name="report-vehicle-type")
        self.service = Service.objects.create(name="report-service")
        self.second_service = Service.objects.create(name="report-service-secondary")
        self.today = timezone.localdate()
        self.month_start = self.today.replace(day=1)
        ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.service,
            price=Decimal("100.00"),
            effective_date=date(2020, 1, 1),
        )
        ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.second_service,
            price=Decimal("30.00"),
            effective_date=date(2020, 1, 1),
        )
        CommissionSetting.objects.create(
            commission_percentage=Decimal("10.00"),
            effective_date=date(2020, 1, 1),
        )
        self.worker = Worker.objects.create(
            full_name="Report Worker",
            phone_number="2065550190",
            employment_date=date(2025, 1, 1),
        )
        self.expense_category = ExpenseCategory.objects.create(
            name="report-operating-category"
        )
        inventory_category = InventoryCategory.objects.create(
            name="report-supply-category"
        )
        self.product = InventoryProduct.objects.create(
            name="Report supply",
            category=inventory_category,
            unit_label="unit",
        )
        self.supplier = Supplier.objects.create(name="Report supplier")
        self.client = APIClient()
        self._create_financial_fixtures()

    def authenticate_as(self, user):
        self.client.force_authenticate(user=user)

    def _create_job(self, plate):
        response = self.client.post(
            "/api/v1/jobs/",
            {
                "number_plate": plate,
                "vehicle_type": str(self.vehicle_type.pk),
                "workers": [str(self.worker.pk)],
                "services": [str(self.service.pk)],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.data["id"]

    def _record_payment(self, job_id, amount):
        response = self.client.post(
            f"/api/v1/jobs/{job_id}/payments/",
            {
                "amount": amount,
                "method": "CASH",
                "payment_date": self.today.isoformat(),
                "notes": "",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(response.status_code, 201)
        return response.data["id"]

    def _record_refund(self, job_id, payment_id, amount):
        return self.client.post(
            f"/api/v1/jobs/{job_id}/refunds/",
            {
                "payment": payment_id,
                "amount": amount,
                "refund_date": self.today.isoformat(),
                "reason": "Reporting fixture refund",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )

    def _create_financial_fixtures(self):
        self.authenticate_as(self.admin)
        completed_id = self._create_job("REPORT-COMPLETE-1")
        completed_payment = self._record_payment(completed_id, "40.00")
        self.client.post(
            f"/api/v1/jobs/{completed_id}/start/",
            {},
            format="json",
        )
        completed = self.client.post(
            f"/api/v1/jobs/{completed_id}/complete/",
            {},
            format="json",
        )
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(
            self._record_refund(completed_id, completed_payment, "10.00").status_code,
            201,
        )
        self.completed_job_id = completed_id

        open_job_id = self._create_job("REPORT-OPEN-1")
        self._record_payment(open_job_id, "20.00")
        self.open_job_id = open_job_id

        canceled_job_id = self._create_job("REPORT-CANCELLED-1")
        canceled_payment = self._record_payment(canceled_job_id, "25.00")
        canceled = self.client.post(
            f"/api/v1/jobs/{canceled_job_id}/cancel/",
            {},
            format="json",
        )
        self.assertEqual(canceled.status_code, 200)
        self.assertEqual(
            self._record_refund(canceled_job_id, canceled_payment, "5.00").status_code,
            201,
        )

        Expense.objects.create(
            category=self.expense_category,
            amount=Decimal("8.00"),
            description="Active report expense",
            expense_date=self.today,
            payment_method=Expense.PaymentMethod.CASH,
            recorded_by=self.admin,
        )
        Expense.objects.create(
            category=self.expense_category,
            amount=Decimal("3.00"),
            description="Cancelled report expense",
            expense_date=self.today,
            payment_method=Expense.PaymentMethod.CASH,
            recorded_by=self.admin,
            cancelled_at=timezone.now(),
            cancelled_by=self.admin,
            cancellation_reason="Duplicate fixture",
        )
        record_inventory_purchase(
            supplier=self.supplier,
            purchase_date=self.today,
            invoice_number="REPORT-PURCHASE",
            notes="Report fixture purchase",
            lines=[
                {
                    "product": self.product,
                    "quantity": Decimal("10.000"),
                    "unit_cost": Decimal("5.00"),
                }
            ],
            actor=self.admin,
        )
        record_inventory_usage(
            product_id=self.product.pk,
            quantity=Decimal("2.000"),
            reason="Report fixture use",
            actor=self.admin,
        )
        CommissionPayment.objects.create(
            worker=self.worker,
            amount=Decimal("4.00"),
            payment_date=self.today,
            recorded_by=self.admin,
        )

    def report_params(self, **overrides):
        values = {
            "start_date": self.month_start.isoformat(),
            "end_date": self.today.isoformat(),
            "group_by": "monthly",
        }
        values.update(overrides)
        return values

    def test_owner_report_handles_refunds_partial_payments_cancellations_and_profit(self):
        self.authenticate_as(self.admin)
        response = self.client.get(
            "/api/v1/reports/summary/",
            self.report_params(),
        )
        self.assertEqual(response.status_code, 200)
        report = response.data

        self.assertEqual(report["completed_jobs"], 1)
        self.assertEqual(report["cancelled_jobs"], 1)
        self.assertEqual(report["total_vehicles_serviced"], 1)
        self.assertEqual(report["revenue_breakdown"]["completed_sales"], "100.00")
        self.assertEqual(report["revenue_breakdown"]["sales_returns"], "10.00")
        self.assertEqual(report["revenue_breakdown"]["net_revenue"], "90.00")
        self.assertEqual(report["revenue_breakdown"]["payments_received"], "85.00")
        self.assertEqual(report["revenue_breakdown"]["refunds_paid"], "15.00")
        self.assertEqual(report["revenue_breakdown"]["net_cash_collected"], "70.00")
        self.assertEqual(report["revenue_breakdown"]["canceled_job_refunds"], "5.00")

        self.assertEqual(report["expenses"]["total"], "8.00")
        self.assertEqual(report["expenses"]["cancelled_amount"], "3.00")
        self.assertEqual(report["commissions"]["net_cost"], "10.00")
        self.assertEqual(report["commissions"]["payouts"], "4.00")
        self.assertEqual(report["inventory"]["purchases"], "50.00")
        self.assertEqual(report["inventory"]["usage_cost"], "10.00")
        self.assertEqual(report["outstanding_payments"]["amount"], "150.00")
        self.assertEqual(report["outstanding_payments"]["job_count"], 2)
        self.assertEqual(
            report["outstanding_payments"]["cash_held_for_cancelled_jobs"],
            "20.00",
        )
        self.assertEqual(report["gross_profit_estimate"], "70.00")
        self.assertEqual(report["net_operating_result"], "62.00")
        self.assertEqual(report["sales_by_service"][0]["revenue"], "100.00")
        self.assertEqual(report["sales_by_period"][0]["net_revenue"], "90.00")

    def test_report_supports_daily_weekly_monthly_grouping_and_date_validation(self):
        self.authenticate_as(self.admin)
        for group_by in ("daily", "weekly", "monthly"):
            response = self.client.get(
                "/api/v1/reports/summary/",
                self.report_params(group_by=group_by),
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["group_by"], group_by)
            self.assertEqual(len(response.data["sales_by_period"]), 1)

        invalid_range = self.client.get(
            "/api/v1/reports/summary/",
            {
                "start_date": self.today.isoformat(),
                "end_date": self.month_start.isoformat(),
            },
        )
        self.assertEqual(invalid_range.status_code, 400)

    def test_reports_are_owner_only_and_super_admin_has_access(self):
        self.authenticate_as(self.manager)
        forbidden = self.client.get("/api/v1/reports/summary/")
        self.assertEqual(forbidden.status_code, 403)

        self.authenticate_as(self.super_admin)
        allowed = self.client.get(
            "/api/v1/reports/summary/",
            self.report_params(),
        )
        self.assertEqual(allowed.status_code, 200)

    def test_csv_and_pdf_exports_contain_the_owner_report(self):
        self.authenticate_as(self.admin)
        params = self.report_params()
        csv_response = self.client.get("/api/v1/reports/exports/csv/", params)
        pdf_response = self.client.get("/api/v1/reports/exports/pdf/", params)

        self.assertEqual(csv_response.status_code, 200)
        self.assertEqual(pdf_response.status_code, 200)
        self.assertIn("text/csv", csv_response["Content-Type"])
        self.assertIn("application/pdf", pdf_response["Content-Type"])
        self.assertTrue(csv_response.content.startswith(b"\xef\xbb\xbf"))
        self.assertTrue(pdf_response.content.startswith(b"%PDF-"))
        self.assertIn(b"GHS", csv_response.content)
        self.assertIn(b"Net operating result", csv_response.content)
