from datetime import date
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.configuration.models import (
    CommissionSetting,
    Service,
    ServicePricing,
    VehicleType,
)
from apps.users.models import User
from apps.workers.models import CommissionPayment, Worker, WorkerJob


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
        self.effective_date = date(2020, 1, 1)
        self.pricing = ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.service,
            price=Decimal("20.00"),
            effective_date=self.effective_date,
        )
        self.commission = CommissionSetting.objects.create(
            commission_percentage=Decimal("15.00"),
            effective_date=self.effective_date,
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

    def create_job(self):
        return self.client.post(
            "/api/v1/jobs/",
            {
                "worker": str(self.worker.pk),
                "vehicle_type": str(self.vehicle_type.pk),
                "service": str(self.service.pk),
            },
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
        self.assertIn("worker", response.data)
        self.assertEqual(WorkerJob.objects.count(), 0)

    def test_active_worker_can_be_assigned_and_job_completion_snapshots_commission(self):
        self.authenticate_as(self.manager)
        assignment_response = self.create_job()
        completion_response = self.client.post(
            f"/api/v1/jobs/{assignment_response.data['id']}/complete/",
            {},
            format="json",
        )

        self.assertEqual(assignment_response.status_code, 201)
        self.assertEqual(assignment_response.data["status"], WorkerJob.Status.ASSIGNED)
        self.assertEqual(completion_response.status_code, 200)
        self.assertEqual(completion_response.data["status"], WorkerJob.Status.COMPLETED)
        self.assertEqual(completion_response.data["service_price"], "20.00")
        self.assertEqual(completion_response.data["commission_percentage"], "15.00")
        self.assertEqual(completion_response.data["commission_amount"], "3.00")

    def test_job_history_exposes_assigned_and_completed_records(self):
        self.authenticate_as(self.manager)
        assignment_response = self.create_job()
        self.client.post(
            f"/api/v1/jobs/{assignment_response.data['id']}/complete/",
            {},
            format="json",
        )

        response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/job-history/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["worker_name"], "Alex Example")
        self.assertEqual(
            response.data["results"][0]["status"],
            WorkerJob.Status.COMPLETED,
        )

    def test_job_commission_uses_the_effective_rate_and_rounds_to_cents(self):
        self.authenticate_as(self.manager)
        ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.service,
            price=Decimal("21.00"),
            effective_date=timezone.localdate(),
        )
        CommissionSetting.objects.create(
            commission_percentage=Decimal("17.50"),
            effective_date=timezone.localdate(),
        )
        assignment_response = self.create_job()

        response = self.client.post(
            f"/api/v1/jobs/{assignment_response.data['id']}/complete/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["service_price"], "21.00")
        self.assertEqual(response.data["commission_percentage"], "17.50")
        self.assertEqual(response.data["commission_amount"], "3.68")

    def test_completion_requires_effective_pricing_and_commission_settings(self):
        self.authenticate_as(self.manager)
        self.pricing.is_active = False
        self.pricing.save(update_fields={"is_active", "updated_at"})
        assignment_response = self.create_job()

        response = self.client.post(
            f"/api/v1/jobs/{assignment_response.data['id']}/complete/",
            {},
            format="json",
        )

        self.assertEqual(assignment_response.status_code, 201)
        self.assertEqual(response.status_code, 400)
        self.assertIn("service", response.data)

    def test_daily_outstanding_commission_and_payment_history(self):
        self.authenticate_as(self.admin)
        assignment_response = self.create_job()
        self.client.post(
            f"/api/v1/jobs/{assignment_response.data['id']}/complete/",
            {},
            format="json",
        )
        summary_url = (
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
            f"?date={timezone.localdate().isoformat()}"
        )

        initial_summary = self.client.get(summary_url)
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

        self.assertEqual(initial_summary.status_code, 200)
        self.assertEqual(initial_summary.data["daily_commission"], "3.00")
        self.assertEqual(initial_summary.data["outstanding_commission"], "3.00")
        self.assertEqual(payment_response.status_code, 201)
        self.assertEqual(payment_response.data["amount"], "1.25")
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.data["count"], 1)
        self.assertEqual(final_summary.data["outstanding_commission"], "1.75")
        self.assertEqual(CommissionPayment.objects.count(), 1)

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
        assignment_response = self.create_job()
        self.client.post(
            f"/api/v1/jobs/{assignment_response.data['id']}/complete/",
            {},
            format="json",
        )

        response = self.client.post(
            f"/api/v1/workers/{self.worker.pk}/commission-payments/",
            {"amount": "3.01"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("amount", response.data)
        self.assertEqual(CommissionPayment.objects.count(), 0)

    def test_cancelled_jobs_do_not_accrue_commission(self):
        self.authenticate_as(self.manager)
        assignment_response = self.create_job()

        cancel_response = self.client.post(
            f"/api/v1/jobs/{assignment_response.data['id']}/cancel/",
            {},
            format="json",
        )
        summary_response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/"
        )

        self.assertEqual(cancel_response.status_code, 200)
        self.assertEqual(cancel_response.data["status"], WorkerJob.Status.CANCELLED)
        self.assertEqual(summary_response.data["daily_commission"], "0.00")
        self.assertEqual(summary_response.data["outstanding_commission"], "0.00")

    def test_commission_summary_rejects_an_invalid_date(self):
        self.authenticate_as(self.manager)

        response = self.client.get(
            f"/api/v1/workers/{self.worker.pk}/commission-summary/?date=not-a-date"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("date", response.data)
