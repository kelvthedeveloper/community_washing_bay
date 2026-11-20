from django.db import migrations
from django.utils import timezone


def migrate_worker_jobs(apps, schema_editor):
    WorkerJob = apps.get_model("workers", "WorkerJob")
    Job = apps.get_model("jobs", "Job")
    JobService = apps.get_model("jobs", "JobService")
    JobWorkerAssignment = apps.get_model("jobs", "JobWorkerAssignment")

    for legacy in WorkerJob.objects.all().iterator():
        completed = legacy.status == "COMPLETED"
        cancelled = legacy.status == "CANCELLED"
        job = Job.objects.create(
            id=legacy.pk,
            number_plate="",
            vehicle_type_id=legacy.vehicle_type_id,
            job_date=timezone.localtime(legacy.assigned_at).date(),
            registered_at=legacy.assigned_at,
            completed_at=legacy.completed_at if completed else None,
            cancelled_at=legacy.updated_at if cancelled else None,
            status=legacy.status if completed or cancelled else "PENDING",
            total_price=legacy.service_price or 0,
            commission_amount=legacy.commission_amount if completed else None,
        )
        Job.objects.filter(pk=job.pk).update(
            created_at=legacy.created_at,
            updated_at=legacy.updated_at,
        )
        JobService.objects.create(
            job_id=job.pk,
            service_id=legacy.service_id,
            price_snapshot=legacy.service_price,
            commission_rate_snapshot=legacy.commission_percentage,
            commission_amount=legacy.commission_amount if completed else None,
        )
        JobWorkerAssignment.objects.create(
            job_id=job.pk,
            worker_id=legacy.worker_id,
            commission_amount=legacy.commission_amount if completed else None,
        )


def restore_worker_jobs(apps, schema_editor):
    Job = apps.get_model("jobs", "Job")
    JobService = apps.get_model("jobs", "JobService")
    JobWorkerAssignment = apps.get_model("jobs", "JobWorkerAssignment")
    WorkerJob = apps.get_model("workers", "WorkerJob")

    for job in Job.objects.all().iterator():
        service = JobService.objects.filter(job_id=job.pk).first()
        assignment = JobWorkerAssignment.objects.filter(job_id=job.pk).first()
        if service is None or assignment is None:
            continue
        legacy = WorkerJob.objects.create(
            id=job.pk,
            worker_id=assignment.worker_id,
            vehicle_type_id=job.vehicle_type_id,
            service_id=service.service_id,
            status=job.status if job.status != "PENDING" else "ASSIGNED",
            assigned_at=job.registered_at,
            completed_at=job.completed_at,
            service_price=service.price_snapshot,
            commission_percentage=service.commission_rate_snapshot,
            commission_amount=assignment.commission_amount,
        )
        WorkerJob.objects.filter(pk=legacy.pk).update(
            created_at=job.created_at,
            updated_at=job.updated_at,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0001_initial"),
        ("workers", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(migrate_worker_jobs, restore_worker_jobs),
        migrations.DeleteModel(name="WorkerJob"),
    ]
