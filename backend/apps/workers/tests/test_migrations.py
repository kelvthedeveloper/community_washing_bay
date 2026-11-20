from datetime import datetime, timezone as datetime_timezone
from decimal import Decimal

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class WorkerJobMigrationTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        self.migrate_to = executor.loader.graph.leaf_nodes()
        self.migrate_from = [
            ("configuration", "0001_initial"),
            ("workers", "0001_initial"),
        ]
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps

        VehicleType = old_apps.get_model("configuration", "VehicleType")
        Service = old_apps.get_model("configuration", "Service")
        ServicePricing = old_apps.get_model("configuration", "ServicePricing")
        CommissionSetting = old_apps.get_model("configuration", "CommissionSetting")
        Worker = old_apps.get_model("workers", "Worker")
        WorkerJob = old_apps.get_model("workers", "WorkerJob")
        vehicle_type = VehicleType.objects.create(name="legacy-migration-vehicle")
        service = Service.objects.create(name="legacy-migration-service")
        ServicePricing.objects.create(
            vehicle_type=vehicle_type,
            service=service,
            price=Decimal("20.00"),
            effective_date="2020-01-01",
        )
        CommissionSetting.objects.create(
            commission_percentage=Decimal("15.00"),
            effective_date="2020-01-01",
        )
        worker = Worker.objects.create(
            full_name="Legacy Washer",
            phone_number="2065550111",
            employment_date="2025-01-01",
        )
        self.assigned_at = datetime(2026, 1, 15, 9, tzinfo=datetime_timezone.utc)
        self.completed_at = datetime(2026, 1, 15, 10, tzinfo=datetime_timezone.utc)
        self.legacy_id = WorkerJob.objects.create(
            worker=worker,
            vehicle_type=vehicle_type,
            service=service,
            status="COMPLETED",
            assigned_at=self.assigned_at,
            completed_at=self.completed_at,
            service_price=Decimal("20.00"),
            commission_percentage=Decimal("15.00"),
            commission_amount=Decimal("3.00"),
        ).pk
        self.legacy_pending_id = WorkerJob.objects.create(
            worker=worker,
            vehicle_type=vehicle_type,
            service=service,
            status="ASSIGNED",
            assigned_at=self.assigned_at,
        ).pk

        intermediate_target = [("jobs", "0001_initial")]
        MigrationExecutor(connection).migrate(intermediate_target)
        intermediate_apps = MigrationExecutor(connection).loader.project_state(
            intermediate_target
        ).apps
        CurrentJob = intermediate_apps.get_model("jobs", "Job")
        CurrentJobService = intermediate_apps.get_model("jobs", "JobService")
        pos_job = CurrentJob.objects.create(
            number_plate=" pos-789 ",
            vehicle_type_id=vehicle_type.pk,
            total_price=Decimal("10.00"),
        )
        CurrentJobService.objects.create(
            job_id=pos_job.pk,
            service_id=service.pk,
            price_snapshot=Decimal("10.00"),
            commission_rate_snapshot=Decimal("15.00"),
        )
        self.pos_job_id = pos_job.pk

        MigrationExecutor(connection).migrate(self.migrate_to)
        new_apps = MigrationExecutor(connection).loader.project_state(self.migrate_to).apps
        self.Job = new_apps.get_model("jobs", "Job")
        self.JobService = new_apps.get_model("jobs", "JobService")
        self.JobWorkerAssignment = new_apps.get_model("jobs", "JobWorkerAssignment")
        self.Vehicle = new_apps.get_model("jobs", "Vehicle")
        self.CommissionLedgerEntry = new_apps.get_model(
            "workers",
            "CommissionLedgerEntry",
        )

    def tearDown(self):
        MigrationExecutor(connection).migrate(self.migrate_to)
        super().tearDown()

    def test_existing_worker_job_is_preserved_in_new_job_ledger(self):
        job = self.Job.objects.get(pk=self.legacy_id)
        service_snapshot = self.JobService.objects.get(job_id=self.legacy_id)
        worker_assignment = self.JobWorkerAssignment.objects.get(job_id=self.legacy_id)

        self.assertEqual(job.status, "COMPLETED")
        self.assertEqual(job.number_plate, "")
        self.assertEqual(job.total_price, Decimal("20.00"))
        self.assertEqual(job.commission_amount, Decimal("3.00"))
        self.assertEqual(job.registered_at, self.assigned_at)
        self.assertEqual(job.completed_at, self.completed_at)
        self.assertEqual(service_snapshot.price_snapshot, Decimal("20.00"))
        self.assertEqual(
            service_snapshot.commission_rate_snapshot,
            Decimal("15.00"),
        )
        self.assertEqual(worker_assignment.commission_amount, Decimal("3.00"))
        commission_entry = self.CommissionLedgerEntry.objects.get(
            assignment_id=worker_assignment.pk
        )
        self.assertEqual(commission_entry.amount, Decimal("3.00"))
        self.assertEqual(commission_entry.commission_rate_snapshot, Decimal("15.00"))
        self.assertEqual(
            commission_entry.allocation_policy_snapshot,
            "EQUAL_SPLIT",
        )

    def test_existing_job_data_gets_pos_totals_and_normalized_vehicle(self):
        job = self.Job.objects.get(pk=self.pos_job_id)
        service_snapshot = self.JobService.objects.get(job_id=self.pos_job_id)
        vehicle = self.Vehicle.objects.get(pk=job.vehicle_id)

        self.assertEqual(job.subtotal, Decimal("10.00"))
        self.assertEqual(job.discount_amount, Decimal("0.00"))
        self.assertEqual(job.total_price, Decimal("10.00"))
        self.assertEqual(service_snapshot.commissionable_amount, Decimal("10.00"))
        self.assertEqual(vehicle.number_plate, "POS-789")

    def test_legacy_unpriced_pending_job_gets_current_effective_snapshots(self):
        job = self.Job.objects.get(pk=self.legacy_pending_id)
        service_snapshot = self.JobService.objects.get(job_id=self.legacy_pending_id)

        self.assertEqual(job.status, "PENDING")
        self.assertEqual(job.subtotal, Decimal("20.00"))
        self.assertEqual(job.total_price, Decimal("20.00"))
        self.assertEqual(service_snapshot.price_snapshot, Decimal("20.00"))
        self.assertEqual(
            service_snapshot.commission_rate_snapshot,
            Decimal("15.00"),
        )
        self.assertEqual(
            service_snapshot.commissionable_amount,
            Decimal("20.00"),
        )
