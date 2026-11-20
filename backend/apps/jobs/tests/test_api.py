from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.configuration.models import CommissionSetting, Service, ServicePricing, VehicleType
from apps.jobs.models import Job, JobPayment, JobRefund, JobWorkerAssignment, Vehicle
from apps.users.models import User
from apps.workers.models import CommissionLedgerEntry, Worker


class PosCorsPreflightTests(SimpleTestCase):
    @override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
    def test_preflight_allows_idempotency_header(self):
        response = self.client.options(
            "/api/v1/pos/sales/",
            HTTP_ORIGIN="http://localhost:5173",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS=(
                "authorization,content-type,idempotency-key"
            ),
        )

        self.assertEqual(response.status_code, 200)
        allowed_headers = response["Access-Control-Allow-Headers"].lower().split(", ")
        self.assertIn("idempotency-key", allowed_headers)
        self.assertIn("authorization", allowed_headers)


class JobApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="jobs-admin",
            email="jobs-admin@example.com",
            password="Admin$Password-2026",
            role=User.Role.ADMIN,
        )
        self.manager = User.objects.create_user(
            username="jobs-manager",
            email="jobs-manager@example.com",
            password="Manager$Password-2026",
            role=User.Role.MANAGER,
        )
        self.super_admin = User.objects.create_superuser(
            username="jobs-super-admin",
            email="jobs-super-admin@example.com",
            password="Super$Password-2026",
        )
        self.vehicle_type = VehicleType.objects.create(name="jobs-fixture-vehicle")
        self.service = Service.objects.create(name="jobs-fixture-service")
        self.second_service = Service.objects.create(name="jobs-fixture-service-2")
        self.effective_date = date(2020, 1, 1)
        ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.service,
            price=Decimal("20.00"),
            effective_date=self.effective_date,
        )
        ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.second_service,
            price=Decimal("10.00"),
            effective_date=self.effective_date,
        )
        CommissionSetting.objects.create(
            commission_percentage=Decimal("15.00"),
            effective_date=self.effective_date,
        )
        self.worker = self.create_worker("Alex Example")
        self.second_worker = self.create_worker("Sam Example")
        self.client = APIClient()

    def create_worker(self, name):
        return Worker.objects.create(
            full_name=name,
            phone_number="2065550182",
            employment_date=date(2025, 6, 1),
        )

    def authenticate_as(self, user):
        self.client.force_authenticate(user=user)

    def job_payload(self, **overrides):
        payload = {
            "number_plate": "ABC-123",
            "vehicle_type": str(self.vehicle_type.pk),
            "workers": [str(self.worker.pk)],
            "services": [str(self.service.pk)],
        }
        payload.update(overrides)
        return payload

    def create_job(self, **overrides):
        return self.client.post(
            "/api/v1/jobs/",
            self.job_payload(**overrides),
            format="json",
        )

    def create_pos_sale(self, payload=None, key=None):
        return self.client.post(
            "/api/v1/pos/sales/",
            payload or {
                **self.job_payload(),
                "initial_payment": {
                    "amount": "0.00",
                    "payment_date": timezone.localdate().isoformat(),
                },
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
        )

    def start_job(self, job_id):
        return self.client.post(
            f"/api/v1/jobs/{job_id}/start/",
            {},
            format="json",
        )

    def complete_job(self, job_id):
        self.start_job(job_id)
        return self.client.post(
            f"/api/v1/jobs/{job_id}/complete/",
            {},
            format="json",
        )

    def test_registration_supports_multiple_workers_and_services_with_snapshots(self):
        self.authenticate_as(self.manager)
        response = self.create_job(
            number_plate=" ab-123 ",
            workers=[str(self.worker.pk), str(self.second_worker.pk)],
            services=[str(self.service.pk), str(self.second_service.pk)],
        )
        job = Job.objects.get(pk=response.data["id"])

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["number_plate"], "AB-123")
        self.assertEqual(response.data["status"], Job.Status.PENDING)
        self.assertEqual(response.data["total_price"], "30.00")
        self.assertEqual(len(response.data["services"]), 2)
        self.assertEqual(len(response.data["assigned_workers"]), 2)
        self.assertEqual(job.created_by, self.manager)
        self.assertEqual(job.updated_by, self.manager)
        self.assertEqual(
            {item.price_snapshot for item in job.job_services.all()},
            {Decimal("20.00"), Decimal("10.00")},
        )

    def test_completion_uses_saved_price_and_commission_snapshots(self):
        self.authenticate_as(self.manager)
        create_response = self.create_job()
        job_id = create_response.data["id"]
        ServicePricing.objects.create(
            vehicle_type=self.vehicle_type,
            service=self.service,
            price=Decimal("50.00"),
            effective_date=timezone.localdate(),
        )
        CommissionSetting.objects.create(
            commission_percentage=Decimal("30.00"),
            effective_date=timezone.localdate(),
        )

        response = self.complete_job(job_id)
        job = Job.objects.get(pk=job_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(job.total_price, Decimal("20.00"))
        self.assertEqual(job.commission_amount, Decimal("3.00"))
        self.assertEqual(job.job_services.get().price_snapshot, Decimal("20.00"))
        self.assertEqual(
            job.job_services.get().commission_rate_snapshot,
            Decimal("15.00"),
        )
        ledger_entry = CommissionLedgerEntry.objects.get(assignment__job=job)
        self.assertEqual(ledger_entry.amount, Decimal("3.00"))
        self.assertEqual(ledger_entry.commission_rate_snapshot, Decimal("15.00"))
        self.assertEqual(
            ledger_entry.allocation_policy_snapshot,
            CommissionSetting.AllocationPolicy.PER_WORKER,
        )
        self.assertEqual(ledger_entry.allocation_worker_count_snapshot, 1)
        self.assertEqual(ledger_entry.recorded_by, self.manager)
        self.assertEqual(response.data["updated_by"], self.manager.pk)
        self.assertIsNotNone(job.washing_started_at)
        self.assertIsNotNone(job.completed_at)

        repeated_completion = self.client.post(
            f"/api/v1/jobs/{job_id}/complete/",
            {},
            format="json",
        )
        self.assertEqual(repeated_completion.status_code, 400)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CommissionLedgerEntry.objects.create(
                    worker=self.worker,
                    job=job,
                    assignment=job.worker_assignments.get(),
                    entry_type=CommissionLedgerEntry.EntryType.EARNED,
                    amount=Decimal("3.00"),
                    effective_date=timezone.localdate(),
                    reason="Duplicate generation attempt",
                    allocation_policy_snapshot="EQUAL_SPLIT",
                    allocation_worker_count_snapshot=1,
                )
        self.assertEqual(CommissionLedgerEntry.objects.count(), 1)

    def test_each_worker_gets_the_configured_percentage_of_the_full_sale(self):
        self.authenticate_as(self.manager)
        pricing = ServicePricing.objects.get(
            vehicle_type=self.vehicle_type,
            service=self.service,
            effective_date=self.effective_date,
        )
        pricing.price = Decimal("35.00")
        pricing.save(update_fields={"price", "updated_at"})
        create_response = self.create_job(
            workers=[
                str(self.worker.pk),
                str(self.second_worker.pk),
            ]
        )

        response = self.complete_job(create_response.data["id"])
        job = Job.objects.get(pk=create_response.data["id"])
        assignments = list(
            JobWorkerAssignment.objects.filter(job_id=create_response.data["id"])
            .order_by("worker_id")
            .values_list("commission_amount", flat=True)
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            assignments,
            [Decimal("5.25"), Decimal("5.25")],
        )
        self.assertEqual(job.commission_amount, Decimal("10.50"))
        self.assertEqual(
            job.job_services.get().commission_amount,
            Decimal("10.50"),
        )
        self.assertEqual(
            list(
                CommissionLedgerEntry.objects.filter(
                    assignment__job_id=create_response.data["id"]
                )
                .order_by("assignment__worker_id")
                .values_list("amount", flat=True)
            ),
            assignments,
        )
        self.assertEqual(
            set(
                CommissionLedgerEntry.objects.filter(
                    assignment__job_id=create_response.data["id"]
                ).values_list("allocation_policy_snapshot", flat=True)
            ),
            {CommissionSetting.AllocationPolicy.PER_WORKER},
        )

    def test_invalid_transitions_and_cancelled_jobs_do_not_accrue_commission(self):
        self.authenticate_as(self.manager)
        create_response = self.create_job()
        job_id = create_response.data["id"]

        invalid_complete = self.client.post(
            f"/api/v1/jobs/{job_id}/complete/",
            {},
            format="json",
        )
        cancel_response = self.client.post(
            f"/api/v1/jobs/{job_id}/cancel/",
            {},
            format="json",
        )
        job = Job.objects.get(pk=job_id)
        assignment = job.worker_assignments.get()

        self.assertEqual(invalid_complete.status_code, 400)
        self.assertEqual(cancel_response.status_code, 200)
        self.assertEqual(job.status, Job.Status.CANCELLED)
        self.assertIsNotNone(job.cancelled_at)
        self.assertIsNone(job.commission_amount)
        self.assertIsNone(assignment.commission_amount)
        self.assertFalse(CommissionLedgerEntry.objects.exists())

    def test_payment_records_partial_amount_and_rejects_overpayment(self):
        self.authenticate_as(self.admin)
        create_response = self.create_job()
        job_id = create_response.data["id"]
        self.complete_job(job_id)

        payment_response = self.client.post(
            f"/api/v1/jobs/{job_id}/payments/",
            {
                "amount": "7.50",
                "method": "MOBILE_MONEY",
                "payment_date": timezone.localdate().isoformat(),
                "notes": "Deposit",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        overpayment_response = self.client.post(
            f"/api/v1/jobs/{job_id}/payments/",
            {"amount": "12.51", "method": "CASH"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        detail_response = self.client.get(f"/api/v1/jobs/{job_id}/")

        self.assertEqual(payment_response.status_code, 201)
        self.assertEqual(payment_response.data["payment_date"], timezone.localdate().isoformat())
        self.assertEqual(payment_response.data["method"], "MOBILE_MONEY")
        self.assertEqual(overpayment_response.status_code, 400)
        self.assertEqual(detail_response.data["amount_paid"], "7.50")
        self.assertEqual(detail_response.data["amount_due"], "12.50")
        self.assertEqual(JobPayment.objects.count(), 1)

    def test_pos_sale_applies_authorized_discount_and_records_partial_payment_atomically(self):
        self.authenticate_as(self.admin)
        key = uuid4()
        response = self.create_pos_sale(
            {
                **self.job_payload(),
                "discount_type": "FIXED",
                "discount_value": "5.00",
                "initial_payment": {
                    "amount": "7.50",
                    "method": "MOBILE_MONEY",
                    "payment_date": timezone.localdate().isoformat(),
                    "notes": "Initial deposit",
                },
            },
            key=key,
        )

        job = Job.objects.get(pk=response.data["id"])
        payment = JobPayment.objects.get(job=job)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(job.subtotal, Decimal("20.00"))
        self.assertEqual(job.discount_amount, Decimal("5.00"))
        self.assertEqual(job.total_price, Decimal("15.00"))
        self.assertEqual(job.amount_paid, Decimal("7.50"))
        self.assertEqual(job.discount_applied_by, self.admin)
        self.assertEqual(payment.recorded_by, self.admin)
        self.assertEqual(payment.method, JobPayment.Method.MOBILE_MONEY)
        self.assertEqual(payment.idempotency_key, key)
        self.assertEqual(
            job.job_services.get().commissionable_amount,
            Decimal("15.00"),
        )
        self.assertEqual(response.data["amount_due"], "7.50")
        self.assertEqual(response.data["payment_status"], "PARTIAL")
        self.start_job(job.pk)
        completion_response = self.client.post(
            f"/api/v1/jobs/{job.pk}/complete/",
            {},
            format="json",
        )
        self.assertEqual(completion_response.status_code, 200)
        self.assertEqual(
            Job.objects.get(pk=job.pk).commission_amount,
            Decimal("2.25"),
        )

    def test_manager_cannot_apply_discount_and_invalid_discount_rolls_back_sale(self):
        self.authenticate_as(self.manager)
        forbidden = self.create_pos_sale(
            {
                **self.job_payload(),
                "discount_type": "PERCENTAGE",
                "discount_value": "10.00",
            }
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(Job.objects.count(), 0)
        self.assertEqual(JobPayment.objects.count(), 0)

        self.authenticate_as(self.admin)
        too_large = self.create_pos_sale(
            {
                **self.job_payload(),
                "discount_type": "FIXED",
                "discount_value": "20.01",
            }
        )
        self.assertEqual(too_large.status_code, 400)
        self.assertEqual(Job.objects.count(), 0)

    def test_initial_payment_above_server_total_rolls_back_job_and_vehicle(self):
        self.authenticate_as(self.manager)
        response = self.create_pos_sale(
            {
                **self.job_payload(),
                "initial_payment": {
                    "amount": "20.01",
                    "method": "CASH",
                    "payment_date": timezone.localdate().isoformat(),
                },
            }
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Job.objects.count(), 0)
        self.assertEqual(JobPayment.objects.count(), 0)
        self.assertEqual(Vehicle.objects.count(), 0)

    def test_pos_sale_replays_idempotently_and_rejects_key_reuse_with_other_payload(self):
        self.authenticate_as(self.admin)
        key = uuid4()
        payload = {
            **self.job_payload(),
            "initial_payment": {
                "amount": "10.00",
                "method": "CASH",
                "payment_date": timezone.localdate().isoformat(),
                "notes": "",
            },
        }
        first_response = self.create_pos_sale(payload, key)
        replay_response = self.create_pos_sale(payload, key)
        conflict_response = self.create_pos_sale(
            {**payload, "number_plate": "OTHER-123"},
            key,
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(replay_response.status_code, 200)
        self.assertEqual(replay_response["Idempotency-Replayed"], "true")
        self.assertEqual(replay_response.data["id"], first_response.data["id"])
        self.assertEqual(conflict_response.status_code, 409)
        self.assertEqual(Job.objects.count(), 1)
        self.assertEqual(JobPayment.objects.count(), 1)

    def test_payment_retry_does_not_double_count_and_reused_key_conflicts(self):
        self.authenticate_as(self.manager)
        create_response = self.create_job()
        payment_url = f"/api/v1/jobs/{create_response.data['id']}/payments/"
        key = uuid4()
        payload = {
            "amount": "5.00",
            "method": "CARD",
            "payment_date": timezone.localdate().isoformat(),
            "notes": "Terminal payment",
        }
        first = self.client.post(
            payment_url,
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key),
        )
        replay = self.client.post(
            payment_url,
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key),
        )
        conflict = self.client.post(
            payment_url,
            {**payload, "amount": "6.00"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key),
        )
        job = Job.objects.get(pk=create_response.data["id"])

        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay["Idempotency-Replayed"], "true")
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(job.amount_paid, Decimal("5.00"))
        self.assertEqual(JobPayment.objects.count(), 1)

    def test_refunds_are_admin_only_idempotent_and_reduce_the_net_paid_balance(self):
        self.authenticate_as(self.manager)
        job_response = self.create_job()
        job_id = job_response.data["id"]
        payment = self.client.post(
            f"/api/v1/jobs/{job_id}/payments/",
            {
                "amount": "15.00",
                "method": "MOBILE_MONEY",
                "payment_date": timezone.localdate().isoformat(),
                "notes": "Partial payment",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(payment.status_code, 201)
        refund_payload = {
            "payment": payment.data["id"],
            "amount": "5.00",
            "refund_date": timezone.localdate().isoformat(),
            "reason": "Partial service refund",
        }
        refund_key = uuid4()
        refund_url = f"/api/v1/jobs/{job_id}/refunds/"
        forbidden = self.client.post(
            refund_url,
            refund_payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(refund_key),
        )
        self.assertEqual(forbidden.status_code, 403)

        self.authenticate_as(self.admin)
        created = self.client.post(
            refund_url,
            refund_payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(refund_key),
        )
        replay = self.client.post(
            refund_url,
            refund_payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(refund_key),
        )
        excessive = self.client.post(
            refund_url,
            {**refund_payload, "amount": "11.00"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )

        job = Job.objects.get(pk=job_id)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay["Idempotency-Replayed"], "true")
        self.assertEqual(excessive.status_code, 400)
        self.assertEqual(JobRefund.objects.count(), 1)
        self.assertEqual(job.amount_paid, Decimal("10.00"))
        self.assertEqual(job.amount_due, Decimal("10.00"))
        self.assertEqual(created.data["method"], "MOBILE_MONEY")

    def test_canceled_job_refund_remains_auditable_and_visible_in_receipt(self):
        self.authenticate_as(self.admin)
        sale = self.create_pos_sale(
            {
                **self.job_payload(),
                "initial_payment": {
                    "amount": "10.00",
                    "method": "CASH",
                    "payment_date": timezone.localdate().isoformat(),
                    "notes": "",
                },
            }
        )
        job_id = sale.data["id"]
        payment = JobPayment.objects.get(job_id=job_id)
        self.client.post(
            f"/api/v1/jobs/{job_id}/cancel/",
            {},
            format="json",
        )
        refund = self.client.post(
            f"/api/v1/jobs/{job_id}/refunds/",
            {
                "payment": str(payment.pk),
                "amount": "10.00",
                "refund_date": timezone.localdate().isoformat(),
                "reason": "Sale cancelled",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        receipt = self.client.get(f"/api/v1/jobs/{job_id}/receipt/")

        self.assertEqual(refund.status_code, 201)
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(len(receipt.data["refunds"]), 1)
        self.assertEqual(receipt.data["job"]["amount_paid"], "0.00")

    def test_vehicle_lookup_and_receipt_return_sale_and_payment_history(self):
        self.authenticate_as(self.admin)
        sale = self.create_pos_sale(
            {
                **self.job_payload(number_plate=" ab-123 "),
                "initial_payment": {
                    "amount": "10.00",
                    "method": "CASH",
                    "payment_date": timezone.localdate().isoformat(),
                },
            }
        )
        job_id = sale.data["id"]
        vehicle_response = self.client.get("/api/v1/vehicles/?search=AB-123")
        receipt_response = self.client.get(f"/api/v1/jobs/{job_id}/receipt/")

        self.assertEqual(sale.status_code, 201)
        self.assertEqual(vehicle_response.status_code, 200)
        self.assertEqual(vehicle_response.data["count"], 1)
        self.assertEqual(vehicle_response.data["results"][0]["number_plate"], "AB-123")
        self.assertEqual(receipt_response.status_code, 200)
        self.assertEqual(receipt_response.data["job"]["id"], job_id)
        self.assertEqual(len(receipt_response.data["payments"]), 1)
        self.assertTrue(receipt_response.data["receipt_number"].startswith("CBW-"))

    def test_search_and_daily_filtering_find_jobs_by_number_plate(self):
        self.authenticate_as(self.manager)
        self.create_job(number_plate="XYZ-789")
        response = self.client.get(
            f"/api/v1/jobs/?search=xyz&job_date={timezone.localdate().isoformat()}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["number_plate"], "XYZ-789")

    def test_job_api_requires_authentication_and_roles_can_manage_jobs(self):
        anonymous_response = self.client.get("/api/v1/jobs/")
        self.assertEqual(anonymous_response.status_code, 401)

        for user in (self.manager, self.admin, self.super_admin):
            with self.subTest(role=user.role):
                self.authenticate_as(user)
                response = self.client.get("/api/v1/jobs/")
                self.assertEqual(response.status_code, 200)
