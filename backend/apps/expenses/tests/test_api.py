from datetime import date
from decimal import Decimal
from tempfile import TemporaryDirectory

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.configuration.models import ExpenseCategory
from apps.expenses.models import Expense, ExpenseHistory
from apps.users.models import User


class ExpenseApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="expense-admin",
            email="expense-admin@example.com",
            password="Admin$Password-2026",
            role=User.Role.ADMIN,
        )
        self.manager = User.objects.create_user(
            username="expense-manager",
            email="expense-manager@example.com",
            password="Manager$Password-2026",
            role=User.Role.MANAGER,
        )
        self.super_admin = User.objects.create_superuser(
            username="expense-super-admin",
            email="expense-super-admin@example.com",
            password="Super$Password-2026",
        )
        self.category = ExpenseCategory.objects.create(
            name="test-expense-category",
        )
        self.client = APIClient()

    def authenticate_as(self, user):
        self.client.force_authenticate(user=user)

    def payload(self, **overrides):
        values = {
            "category": str(self.category.pk),
            "amount": "24.75",
            "description": "Routine premises expense",
            "expense_date": date(2026, 11, 12).isoformat(),
            "payment_method": Expense.PaymentMethod.CASH,
        }
        values.update(overrides)
        return values

    def create_expense(self, **overrides):
        return self.client.post(
            "/api/v1/expenses/",
            self.payload(**overrides),
            format="json",
        )

    def test_authentication_and_manager_recording_permissions(self):
        anonymous_response = self.client.get("/api/v1/expenses/")
        self.assertEqual(anonymous_response.status_code, 401)

        self.authenticate_as(self.manager)
        create_response = self.create_expense()
        self.assertEqual(create_response.status_code, 201)
        expense_id = create_response.data["id"]
        expense = Expense.objects.get(pk=expense_id)

        self.assertEqual(expense.recorded_by, self.manager)
        self.assertEqual(
            expense.audit_history.get().event_type,
            ExpenseHistory.EventType.CREATED,
        )
        self.assertEqual(create_response.data["recorded_by_name"], self.manager.username)
        self.assertNotIn("receipt", create_response.data)

        self.assertEqual(
            self.client.patch(
                f"/api/v1/expenses/{expense_id}/",
                {"amount": "25.00"},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/expenses/{expense_id}/cancel/",
                {"reason": "Correction requested"},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/expenses/{expense_id}/").status_code,
            405,
        )

    def test_admin_edits_are_audited_and_cancelled_expense_is_not_counted(self):
        self.authenticate_as(self.manager)
        created = self.create_expense()
        expense_id = created.data["id"]

        self.authenticate_as(self.admin)
        updated = self.client.patch(
            f"/api/v1/expenses/{expense_id}/",
            {
                "amount": "30.00",
                "description": "Corrected premises expense",
            },
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["amount"], "30.00")
        self.assertEqual(updated.data["updated_by_name"], self.admin.username)

        history = self.client.get(
            f"/api/v1/expenses/{expense_id}/history/"
        )
        self.assertEqual(history.status_code, 200)
        self.assertEqual(
            [entry["event_type"] for entry in history.data],
            ["CREATED", "UPDATED"],
        )
        self.assertEqual(history.data[1]["before"]["amount"], "24.75")
        self.assertEqual(history.data[1]["after"]["amount"], "30.00")

        cancellation = self.client.post(
            f"/api/v1/expenses/{expense_id}/cancel/",
            {"reason": "Duplicate entry"},
            format="json",
        )
        self.assertEqual(cancellation.status_code, 200)
        self.assertIsNotNone(cancellation.data["cancelled_at"])
        self.assertEqual(cancellation.data["cancellation_reason"], "Duplicate entry")
        self.assertEqual(
            ExpenseHistory.objects.filter(
                expense_id=expense_id,
                event_type=ExpenseHistory.EventType.CANCELLED,
            ).count(),
            1,
        )

        repeated_cancel = self.client.post(
            f"/api/v1/expenses/{expense_id}/cancel/",
            {"reason": "Cancel again"},
            format="json",
        )
        edit_cancelled = self.client.patch(
            f"/api/v1/expenses/{expense_id}/",
            {"amount": "31.00"},
            format="json",
        )
        monthly = self.client.get(
            "/api/v1/expenses/reports/monthly/?month=2026-11"
        )
        self.assertEqual(repeated_cancel.status_code, 400)
        self.assertEqual(edit_cancelled.status_code, 400)
        self.assertEqual(monthly.status_code, 200)
        self.assertEqual(monthly.data["expense_count"], 0)
        self.assertEqual(monthly.data["cancelled_count"], 1)
        self.assertEqual(monthly.data["total_amount"], Decimal("0.00"))

    def test_daily_and_monthly_reports_filter_and_summarize_uncancelled_expenses(self):
        self.authenticate_as(self.manager)
        first = self.create_expense()
        self.assertEqual(first.status_code, 201)
        second = self.create_expense(
            amount="10.25",
            expense_date="2026-11-18",
            payment_method=Expense.PaymentMethod.CARD,
            description="Equipment repair",
        )
        self.assertEqual(second.status_code, 201)
        third = self.create_expense(
            amount="99.00",
            expense_date="2026-10-30",
        )
        self.assertEqual(third.status_code, 201)

        daily = self.client.get(
            "/api/v1/expenses/reports/daily/?date=2026-11-12"
        )
        monthly = self.client.get(
            "/api/v1/expenses/reports/monthly/?month=2026-11"
        )
        filtered = self.client.get(
            "/api/v1/expenses/?expense_date__gte=2026-11-01"
            "&expense_date__lte=2026-11-30&payment_method=CARD"
            "&amount__gte=10.00&is_cancelled=false"
        )

        self.assertEqual(daily.data["expense_count"], 1)
        self.assertEqual(daily.data["total_amount"], Decimal("24.75"))
        self.assertEqual(daily.data["by_category"][0]["category_name"], self.category.name)
        self.assertEqual(monthly.data["expense_count"], 2)
        self.assertEqual(monthly.data["total_amount"], Decimal("35.00"))
        self.assertEqual(len(monthly.data["daily_totals"]), 2)
        self.assertEqual(filtered.data["count"], 1)
        self.assertEqual(filtered.data["results"][0]["amount"], "10.25")

        invalid_date = self.client.get(
            "/api/v1/expenses/reports/daily/?date=2026-02-31"
        )
        invalid_month = self.client.get(
            "/api/v1/expenses/reports/monthly/?month=2026-13"
        )
        self.assertEqual(invalid_date.status_code, 400)
        self.assertEqual(invalid_month.status_code, 400)

    def test_inactive_categories_and_invalid_payment_methods_are_rejected(self):
        self.authenticate_as(self.admin)
        self.category.is_active = False
        self.category.save(update_fields={"is_active", "updated_at"})

        inactive_category = self.create_expense()
        self.assertEqual(inactive_category.status_code, 400)
        self.category.is_active = True
        self.category.save(update_fields={"is_active", "updated_at"})

        invalid_method = self.create_expense(payment_method="CRYPTO")
        invalid_amount = self.create_expense(amount="0.00")
        self.assertEqual(invalid_method.status_code, 400)
        self.assertEqual(invalid_amount.status_code, 400)

    def test_receipt_upload_is_audited_and_download_requires_authentication(self):
        with TemporaryDirectory() as upload_dir:
            with override_settings(MEDIA_ROOT=upload_dir):
                self.authenticate_as(self.manager)
                response = self.client.post(
                    "/api/v1/expenses/",
                    {
                        **self.payload(),
                        "receipt": SimpleUploadedFile(
                            "receipt.pdf",
                            b"%PDF-1.7 test receipt",
                            content_type="application/pdf",
                        ),
                    },
                    format="multipart",
                )
                self.assertEqual(response.status_code, 201)
                expense_id = response.data["id"]
                self.assertTrue(response.data["has_receipt"])
                self.assertEqual(response.data["receipt_name"], "receipt.pdf")

                download = self.client.get(
                    f"/api/v1/expenses/{expense_id}/receipt/"
                )
                self.assertEqual(download.status_code, 200)
                self.assertIn(b"%PDF-1.7", b"".join(download.streaming_content))

                self.client.force_authenticate(user=None)
                unauthorized = self.client.get(
                    f"/api/v1/expenses/{expense_id}/receipt/"
                )
                self.assertEqual(unauthorized.status_code, 401)

    def test_invalid_receipt_signature_is_rejected(self):
        self.authenticate_as(self.manager)
        response = self.client.post(
            "/api/v1/expenses/",
            {
                **self.payload(),
                "receipt": SimpleUploadedFile(
                    "not-a-pdf.pdf",
                    b"not a PDF file",
                    content_type="application/pdf",
                ),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Expense.objects.exists())

    def test_super_admin_can_edit_and_cancel_expenses(self):
        self.authenticate_as(self.manager)
        created = self.create_expense()
        expense_id = created.data["id"]

        self.authenticate_as(self.super_admin)
        updated = self.client.patch(
            f"/api/v1/expenses/{expense_id}/",
            {"amount": "28.00"},
            format="json",
        )
        cancelled = self.client.post(
            f"/api/v1/expenses/{expense_id}/cancel/",
            {"reason": "Super Admin review"},
            format="json",
        )

        self.assertEqual(updated.status_code, 200)
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(
            Expense.objects.get(pk=expense_id).amount,
            Decimal("28.00"),
        )
