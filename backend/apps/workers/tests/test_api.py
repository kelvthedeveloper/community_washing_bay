from datetime import date
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.configuration.models import CommissionSetting, Service, ServicePricing, VehicleType
from apps.jobs.models import Job, JobWorkerAssignment
from apps.users.models import User
from apps.workers.models import CommissionLedgerEntry, CommissionPayment, Worker


class WorkerApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="workers-admin",
            email="workers-admin@example.com",
            password="Admin$Password-2026",
            role=User.Role.ADMIN,
        )
        self.manager = User.objects.create_user(
            username="workers-manager",
            email="workers-manager@example.com",
            password="Manager$Password-2026",
            role=User.Role.MANAGER,
        )
        self.super_admin = User.objects.create_superuser(
            username="workers-super-admin",
            email="workers-super-admin@example.com",
            password="Super$Password-2026",
        )
        self.vehicle_type = VehicleType.objects.create(name="fixture-worker-vehicle")
        self.service = Service.objects.create(name="fixture-worker-service")
        self.pricing = ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.service,
            price=Decimal("20.00"),
            effective_date=date(2020, 1, 1),
        )
        self.commission = CommissionSetting.objects.create(
            commission_percentage=Decimal("15.00"),
            effective_date=date(2020, 1, 1),
        )
        self.worker = Worker.objects.create(
            full_name="Alex Example",
            phone_number="+1 (206) 555-0182",
            employment_date=date(2025, 6, 1),
        )
        self.client = APIClient()

    def authenticate_as(self, user):
        self.client.force_authenticate(user=user)

    def worker_payload(self, **overrides):
        payload = {
            "full_name": "Jordan Example",
            "phone_number": "+1 206 555 0199",
            "address": "",
            "employment_date": "2026-01-15",
            "is_active": True,
            "notes": "",
        }
        payload.update(overrides)
        return payload

    def create_job(self, workers=None):
        return self.client.post(
            "/api/v1/jobs/",
            {
                "number_plate": "ABC-123",
                "vehicle_type": str(self.vehicle_type.pk),
                "workers": [
                    str(worker.pk) for worker in (workers or [self.worker])
                ],
                "services": [str(self.service.pk)],
            },
            format="json",
        )

    def complete_job(self, job_id):
        self.client.post(f"/api/v1/jobs/{job_id}/start/", {}, format="json")
        return self.client.post(
            f"/api/v1/jobs/{job_id}/complete/",
            {},
            format="json",
        )

    def test_worker_crud_is_available_to_manager_admin_and_super_admin(self):
        for user in (self.manager, self.admin, self.super_admin):
            with self.subTest(role=user.role):
                self.authenticate_as(user)
                create_response = self.client.post(
                    "/api/v1/workers/",
                    self.worker_payload(),
                    format="json",
                )
                self.assertEqual(create_response.status_code, 201)
                worker_id = create_response.data["id"]
                update_response = self.client.patch(
                    f"/api/v1/workers/{worker_id}/",
                    {"phone_number": "+1 206 555 0123"},
                    format="json",
                )
                self.assertEqual(update_response.status_code, 200)
                deactivate_response = self.client.delete(
                    f"/api/v1/workers/{worker_id}/"
                )
                self.assertEqual(deactivate_response.status_code, 204)
                self.assertFalse(Worker.objects.get(pk=worker_id).is_active)

    def test_worker_registration_validates_fields_and_does_not_create_login_user(self):
        self.authenticate_as(self.manager)
        user_count = User.objects.count()

        invalid_response = self.client.post(
            "/api/v1/workers/",
            self.worker_payload(phone_number="not a phone"),
            format="json",
        )
        valid_response = self.client.post(
            "/api/v1/workers/",
            self.worker_payload(),
            format="json",
        )

        self.assertEqual(invalid_response.status_code, 400)
        self.assertEqual(valid_response.status_code, 201)
        self.assertEqual(User.objects.count(), user_count)
        self.assertEqual(Worker.objects.count(), 2)

    def test_worker_api_requires_authentication(self):
        response = self.client.get("/api/v1/workers/")

        self.assertEqual(response.status_code, 401)

    def test_inactive_worker_cannot_be_assigned_to_a_new_job(self):
        self.authenticate_as(self.manager)
        self.worker.deactivate()

        response = self.create_job()

        self.assertEqual(response.status_code, 400)
        self.assertIn("workers", response.data)
        self.assertEqual(Job.objects.count(), 0)

    def test_daily_commission_and_payment_history_use_completed_job_assignments(self):
        self.authenticate_as(self.admin)
        job_response = self.create_job()
        completion_response = self.complete_job(job_response.data["id"])
        summary_url = (
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
            f"?date={job_response.data['job_date']}"
        )
        weekly_summary_url = (
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
            f"?date={job_response.data['job_date']}&period=weekly"
        )
        monthly_summary_url = (
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
            f"?date={job_response.data['job_date']}&period=monthly"
        )

        initial_summary = self.client.get(summary_url)
        weekly_summary = self.client.get(weekly_summary_url)
        monthly_summary = self.client.get(monthly_summary_url)
        payment_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/",
            {
                "amount": "1.25",
                "payment_date": timezone.localdate().isoformat(),
                "notes": "Fixture payment",
            },
            format="json",
        )
        history_response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/"
        )
        final_summary = self.client.get(summary_url)

        self.assertEqual(job_response.status_code, 201)
        self.assertEqual(completion_response.status_code, 200)
        self.assertEqual(initial_summary.status_code, 200)
        self.assertEqual(initial_summary.data["total_wash_sales"], "20.00")
        self.assertEqual(initial_summary.data["commission_percentage"], "15.00")
        self.assertEqual(initial_summary.data["commission_percentages"], ["15.00"])
        self.assertEqual(initial_summary.data["daily_commission"], "3.00")
        self.assertEqual(initial_summary.data["outstanding_commission"], "3.00")
        for summary in (weekly_summary, monthly_summary):
            self.assertEqual(summary.status_code, 200)
            self.assertEqual(summary.data["total_wash_sales"], "20.00")
            self.assertEqual(summary.data["commission_percentage"], "15.00")
            self.assertEqual(summary.data["earned_commission"], "3.00")
        self.assertEqual(payment_response.status_code, 201)
        self.assertEqual(payment_response.data["amount"], "1.25")
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.data["count"], 1)
        self.assertEqual(final_summary.data["outstanding_commission"], "1.75")
        self.assertEqual(CommissionPayment.objects.count(), 1)
        self.assertEqual(JobWorkerAssignment.objects.count(), 1)
        ledger_entry = CommissionLedgerEntry.objects.get(
            assignment__job_id=job_response.data["id"]
        )
        self.assertEqual(ledger_entry.amount, Decimal("3.00"))

    def test_worker_sales_and_commission_summaries_are_independent(self):
        self.authenticate_as(self.manager)
        second_worker = Worker.objects.create(
            full_name="Sam Example",
            phone_number="+1 (206) 555-0183",
            employment_date=date(2025, 6, 1),
        )
        first_job = self.create_job()
        self.assertEqual(self.complete_job(first_job.data["id"]).status_code, 200)

        self.pricing.price = Decimal("10.00")
        self.pricing.save(update_fields={"price", "updated_at"})
        second_job = self.create_job(workers=[second_worker])
        self.assertEqual(self.complete_job(second_job.data["id"]).status_code, 200)

        first_summary = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
        )
        second_summary = self.client.get(
            f"/api/v1/workers/{second_worker.pk}/commission-summary/"
        )

        self.assertEqual(first_summary.status_code, 200)
        self.assertEqual(first_summary.data["total_wash_sales"], "20.00")
        self.assertEqual(first_summary.data["earned_commission"], "3.00")
        self.assertEqual(second_summary.status_code, 200)
        self.assertEqual(second_summary.data["total_wash_sales"], "10.00")
        self.assertEqual(second_summary.data["earned_commission"], "1.50")
        self.assertEqual(second_summary.data["commission_percentage"], "15.00")

    def test_daily_weekly_and_monthly_summaries_include_ledger_and_paid_totals(self):
        for effective_date, amount in (
            (date(2026, 2, 28), Decimal("100.00")),
            (date(2026, 3, 1), Decimal("1.00")),
            (date(2026, 3, 9), Decimal("2.00")),
            (date(2026, 3, 15), Decimal("3.00")),
        ):
            CommissionLedgerEntry.objects.create(
                worker=self.worker,
                entry_type=CommissionLedgerEntry.EntryType.ADJUSTMENT,
                amount=amount,
                effective_date=effective_date,
                reason="Summary fixture",
            )
        CommissionPayment.objects.create(
            worker=self.worker,
            amount=Decimal("0.50"),
            payment_date=date(2026, 3, 10),
        )
        self.authenticate_as(self.manager)

        daily = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
            "?date=2026-03-15&period=daily"
        )
        weekly = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
            "?date=2026-03-15&period=weekly"
        )
        monthly = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
            "?date=2026-03-15&period=monthly"
        )

        self.assertEqual(daily.data["earned_commission"], "3.00")
        self.assertEqual(daily.data["daily_commission"], "3.00")
        self.assertEqual(daily.data["paid_commission"], "0.00")
        self.assertEqual(weekly.data["period_start"], "2026-03-09")
        self.assertEqual(weekly.data["period_end"], "2026-03-15")
        self.assertEqual(weekly.data["earned_commission"], "5.00")
        self.assertEqual(weekly.data["paid_commission"], "0.50")
        self.assertEqual(monthly.data["period_start"], "2026-03-01")
        self.assertEqual(monthly.data["period_end"], "2026-03-31")
        self.assertEqual(monthly.data["earned_commission"], "6.00")
        self.assertEqual(monthly.data["paid_commission"], "0.50")
        self.assertEqual(monthly.data["outstanding_commission"], "105.50")

    def test_admin_can_adjust_and_reverse_ledger_entries_without_mutating_history(self):
        self.authenticate_as(self.admin)
        job_response = self.create_job()
        self.complete_job(job_response.data["id"])
        earned = CommissionLedgerEntry.objects.get(
            assignment__job_id=job_response.data["id"]
        )
        payment_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/",
            {"amount": "2.00", "payment_date": timezone.localdate().isoformat()},
            format="json",
        )
        adjustment_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/",
            {
                "entry_type": "ADJUSTMENT",
                "amount": "1.25",
                "reason": "Approved correction",
            },
            format="json",
        )
        reversal_payload = {
            "entry_type": "REVERSAL",
            "source_entry": str(earned.pk),
            "reason": "Reverse incorrect accrual",
        }
        reversal_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/",
            reversal_payload,
            format="json",
        )
        duplicate_reversal = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/",
            reversal_payload,
            format="json",
        )
        ledger_response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/"
        )
        summary_response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
        )

        self.assertEqual(payment_response.status_code, 201)
        self.assertEqual(adjustment_response.status_code, 201)
        self.assertEqual(adjustment_response.data["amount"], "1.25")
        self.assertEqual(adjustment_response.data["recorded_by"], self.admin.pk)
        self.assertEqual(reversal_response.status_code, 201)
        self.assertEqual(reversal_response.data["amount"], "-3.00")
        self.assertEqual(reversal_response.data["source_entry"], earned.pk)
        self.assertEqual(duplicate_reversal.status_code, 400)
        self.assertEqual(ledger_response.status_code, 200)
        self.assertEqual(ledger_response.data["count"], 3)
        self.assertEqual(summary_response.data["earned_commission"], "1.25")
        self.assertEqual(summary_response.data["paid_commission"], "2.00")
        self.assertEqual(summary_response.data["outstanding_commission"], "-0.75")
        self.assertEqual(CommissionLedgerEntry.objects.count(), 3)
        with self.assertRaises(TypeError):
            earned.reason = "changed"
            earned.save()
        with self.assertRaises(TypeError):
            CommissionLedgerEntry.objects.filter(pk=earned.pk).update(
                reason="changed"
            )
        with self.assertRaises(TypeError):
            earned.delete()
        self.assertEqual(
            CommissionLedgerEntry.objects.get(pk=earned.pk).reason,
            f"Commission earned on completed job ABC-123.",
        )

    def test_manager_can_view_but_not_write_commission_ledger(self):
        self.authenticate_as(self.manager)

        list_response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/"
        )
        create_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/",
            {
                "entry_type": "ADJUSTMENT",
                "amount": "1.00",
                "reason": "Unauthorized adjustment",
            },
            format="json",
        )

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(create_response.status_code, 403)

        self.authenticate_as(self.super_admin)
        super_admin_create = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/",
            {
                "entry_type": "ADJUSTMENT",
                "amount": "1.00",
                "reason": "Super Admin correction",
            },
            format="json",
        )
        self.assertEqual(super_admin_create.status_code, 201)

    def test_full_reversal_carries_negative_balance_and_prevents_new_payouts(self):
        self.authenticate_as(self.admin)
        job_response = self.create_job()
        self.complete_job(job_response.data["id"])
        earned = CommissionLedgerEntry.objects.get(
            assignment__job_id=job_response.data["id"]
        )
        payment_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/",
            {"amount": "2.00", "payment_date": timezone.localdate().isoformat()},
            format="json",
        )
        reversal_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-ledger/",
            {
                "entry_type": "REVERSAL",
                "source_entry": str(earned.pk),
                "reason": "Reverse previously paid commission",
            },
            format="json",
        )
        payout_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/",
            {"amount": "0.01"},
            format="json",
        )
        summary_response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
        )

        self.assertEqual(payment_response.status_code, 201)
        self.assertEqual(reversal_response.status_code, 201)
        self.assertEqual(reversal_response.data["amount"], "-3.00")
        self.assertEqual(payout_response.status_code, 400)
        self.assertEqual(summary_response.data["outstanding_commission"], "-2.00")

    def test_manager_can_view_payments_but_cannot_record_them(self):
        self.authenticate_as(self.manager)

        read_response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/"
        )
        create_response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/",
            {"amount": "1.00"},
            format="json",
        )

        self.assertEqual(read_response.status_code, 200)
        self.assertEqual(create_response.status_code, 403)

    def test_commission_payment_cannot_exceed_outstanding_balance(self):
        self.authenticate_as(self.admin)
        job_response = self.create_job()
        self.complete_job(job_response.data["id"])

        response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/",
            {"amount": "3.01"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("amount", response.data)
        self.assertEqual(CommissionPayment.objects.count(), 0)
