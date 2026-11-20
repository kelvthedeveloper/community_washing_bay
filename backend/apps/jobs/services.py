import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import APIException

from apps.configuration.models import (
    CommissionSetting,
    Service,
    ServicePricing,
    VehicleType,
)
from apps.jobs.models import (
    Job,
    JobPayment,
    JobRefund,
    JobService,
    JobWorkerAssignment,
    Vehicle,
)
from apps.workers.models import CommissionLedgerEntry, Worker


ZERO_MONEY = Decimal("0.00")
ONE_CENT = Decimal("0.01")


class IdempotencyConflict(APIException):
    status_code = 409
    default_detail = "This idempotency key has already been used for a different request."
    default_code = "idempotency_conflict"


def build_job_quote(vehicle_type, services, job_date):
    if not vehicle_type.is_active:
        raise serializers.ValidationError(
            {"vehicle_type": "Inactive vehicle types cannot be used for new jobs."}
        )
    if not services:
        raise serializers.ValidationError(
            {"services": "Select at least one service."}
        )

    commission_setting = (
        CommissionSetting.objects.filter(
            is_active=True,
            effective_date__lte=job_date,
        )
        .order_by("-effective_date")
        .first()
    )
    if commission_setting is None:
        raise serializers.ValidationError(
            {"commission": "No active commission setting is effective for this date."}
        )

    lines = []
    subtotal = ZERO_MONEY
    for service in services:
        if not service.is_active:
            raise serializers.ValidationError(
                {"services": f"{service.name} is inactive and cannot be added."}
            )
        pricing = (
            ServicePricing.objects.filter(
                vehicle_type=vehicle_type,
                service=service,
                is_active=True,
                effective_date__lte=job_date,
            )
            .order_by("-effective_date")
            .first()
        )
        if pricing is None:
            raise serializers.ValidationError(
                {
                    "services": (
                        f"No active price for {service.name} is effective "
                        f"on {job_date.isoformat()}."
                    )
                }
            )
        lines.append(
            {
                "service": service,
                "pricing_record": pricing,
                "commission_setting": commission_setting,
                "price": pricing.price,
                "commission_rate": commission_setting.commission_percentage,
            }
        )
        subtotal += pricing.price

    return {
        "job_date": job_date,
        "vehicle_type": vehicle_type,
        "services": lines,
        "subtotal": subtotal,
    }


def calculate_discount(subtotal, discount_type, discount_value):
    if discount_type == Job.DiscountType.NONE:
        if discount_value != ZERO_MONEY:
            raise serializers.ValidationError(
                {"discount_value": "A discount value requires a discount type."}
            )
        return ZERO_MONEY
    if discount_value <= ZERO_MONEY:
        raise serializers.ValidationError(
            {"discount_value": "Discount value must be greater than zero."}
        )
    if discount_type == Job.DiscountType.PERCENTAGE:
        if discount_value > Decimal("100.00"):
            raise serializers.ValidationError(
                {"discount_value": "Percentage discount cannot exceed 100."}
            )
        amount = (subtotal * discount_value / Decimal("100")).quantize(
            ONE_CENT,
            rounding=ROUND_HALF_UP,
        )
    elif discount_type == Job.DiscountType.FIXED:
        amount = discount_value
    else:
        raise serializers.ValidationError(
            {"discount_type": "Select a supported discount type."}
        )
    if amount > subtotal:
        raise serializers.ValidationError(
            {"discount_value": "Discount cannot exceed the service subtotal."}
        )
    return amount


def build_sale_fingerprint(
    *,
    number_plate,
    vehicle_type,
    workers,
    services,
    discount_type,
    discount_value,
    initial_payment,
):
    request_data = {
        "number_plate": number_plate.strip().upper(),
        "vehicle_type": str(vehicle_type.pk),
        "workers": sorted(str(worker.pk) for worker in workers),
        "services": sorted(str(service.pk) for service in services),
        "discount_type": discount_type,
        "discount_value": format(discount_value, ".2f"),
        "initial_payment": {
            "amount": format(initial_payment["amount"], ".2f"),
            "method": initial_payment.get("method", ""),
            "payment_date": initial_payment["payment_date"].isoformat(),
            "notes": initial_payment.get("notes", ""),
        },
    }
    return hashlib.sha256(
        json.dumps(request_data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def build_refund_fingerprint(*, job, payment, amount, refund_date, reason):
    request_data = {
        "job": str(job.pk),
        "payment": str(payment.pk),
        "amount": format(amount, ".2f"),
        "refund_date": refund_date.isoformat(),
        "reason": reason.strip(),
    }
    return hashlib.sha256(
        json.dumps(request_data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


@transaction.atomic
def record_job_refund(
    *,
    job_id,
    payment_id,
    amount,
    refund_date,
    reason,
    actor,
    idempotency_key,
    request_fingerprint,
):
    job = Job.objects.select_for_update().get(pk=job_id)
    existing = JobRefund.objects.select_for_update().filter(
        idempotency_key=idempotency_key
    ).first()
    if existing is not None:
        if (
            existing.payment.job_id == job.pk
            and existing.request_fingerprint == request_fingerprint
        ):
            return existing, True
        raise IdempotencyConflict()

    payment = (
        JobPayment.objects.select_for_update()
        .filter(pk=payment_id, job=job)
        .first()
    )
    if payment is None:
        raise serializers.ValidationError(
            {"payment": "Select a payment belonging to this job."}
        )
    if refund_date > timezone.localdate():
        raise serializers.ValidationError(
            {"refund_date": "Refund date cannot be in the future."}
        )
    refunded = payment.refunds.aggregate(total=Sum("amount"))["total"] or ZERO_MONEY
    refundable = payment.amount - refunded
    if amount > refundable:
        raise serializers.ValidationError(
            {
                "amount": (
                    "Refund exceeds the unrefunded amount of this payment "
                    f"({refundable:.2f})."
                )
            }
        )
    if amount > job.amount_paid:
        raise serializers.ValidationError(
            {"amount": "Refund exceeds the remaining amount paid for this job."}
        )

    try:
        with transaction.atomic():
            refund = JobRefund.objects.create(
                payment=payment,
                amount=amount,
                refund_date=refund_date,
                reason=reason,
                idempotency_key=idempotency_key,
                request_fingerprint=request_fingerprint,
                recorded_by=actor,
            )
    except IntegrityError:
        existing = JobRefund.objects.select_for_update().filter(
            idempotency_key=idempotency_key
        ).first()
        if existing is None:
            raise
        if (
            existing.payment.job_id == job.pk
            and existing.request_fingerprint == request_fingerprint
        ):
            return existing, True
        raise IdempotencyConflict()

    job.amount_paid -= amount
    job.updated_by = actor
    job.save(update_fields={"amount_paid", "updated_by", "updated_at"})
    return refund, False


@transaction.atomic
def register_job(
    *,
    number_plate,
    vehicle_type,
    workers,
    services,
    actor,
):
    job, _ = _register_job(
        number_plate=number_plate,
        vehicle_type=vehicle_type,
        workers=workers,
        services=services,
        actor=actor,
        discount_type=Job.DiscountType.NONE,
        discount_value=ZERO_MONEY,
    )
    return job


@transaction.atomic
def register_pos_sale(
    *,
    number_plate,
    vehicle_type,
    workers,
    services,
    actor,
    discount_type,
    discount_value,
    initial_payment,
    idempotency_key,
    request_fingerprint,
):
    return _register_job(
        number_plate=number_plate,
        vehicle_type=vehicle_type,
        workers=workers,
        services=services,
        actor=actor,
        discount_type=discount_type,
        discount_value=discount_value,
        initial_payment=initial_payment,
        idempotency_key=idempotency_key,
        request_fingerprint=request_fingerprint,
    )


def _register_job(
    *,
    number_plate,
    vehicle_type,
    workers,
    services,
    actor,
    discount_type,
    discount_value,
    initial_payment=None,
    idempotency_key=None,
    request_fingerprint="",
):
    if idempotency_key is not None:
        existing_job = Job.objects.select_for_update().filter(
            idempotency_key=idempotency_key
        ).first()
        if existing_job is not None:
            if existing_job.request_fingerprint != request_fingerprint:
                raise IdempotencyConflict()
            return existing_job, True
        if JobPayment.objects.select_for_update().filter(
            idempotency_key=idempotency_key
        ).exists():
            raise IdempotencyConflict()

    worker_ids = {worker.pk for worker in workers}
    locked_workers = list(
        Worker.objects.select_for_update()
        .filter(pk__in=worker_ids)
        .order_by("pk")
    )
    if len(locked_workers) != len(worker_ids):
        raise serializers.ValidationError({"workers": "One or more workers do not exist."})
    if any(not worker.is_active for worker in locked_workers):
        raise serializers.ValidationError(
            {"workers": "Inactive workers cannot be assigned to new jobs."}
        )

    locked_vehicle_type = VehicleType.objects.select_for_update().filter(
        pk=vehicle_type.pk
    ).first()
    if locked_vehicle_type is None or not locked_vehicle_type.is_active:
        raise serializers.ValidationError(
            {"vehicle_type": "Inactive or missing vehicle type cannot be used."}
        )
    locked_services = list(
        Service.objects.select_for_update()
        .filter(pk__in=[service.pk for service in services])
        .order_by("pk")
    )
    services_by_id = {service.pk: service for service in locked_services}
    if len(services_by_id) != len(services):
        raise serializers.ValidationError(
            {"services": "One or more services do not exist."}
        )
    ordered_services = [services_by_id[service.pk] for service in services]

    job_date = timezone.localdate()
    quote = build_job_quote(locked_vehicle_type, ordered_services, job_date)
    discount_amount = calculate_discount(
        quote["subtotal"],
        discount_type,
        discount_value,
    )
    discount_lines = allocate_discount(quote["services"], discount_amount, quote["subtotal"])
    total_price = quote["subtotal"] - discount_amount
    initial_amount = (
        initial_payment["amount"] if initial_payment is not None else ZERO_MONEY
    )
    if initial_amount < ZERO_MONEY or initial_amount > total_price:
        raise serializers.ValidationError(
            {"initial_payment": "Payment cannot exceed the discounted sale total."}
        )

    vehicle = _get_or_create_vehicle(
        number_plate=number_plate,
        vehicle_type=locked_vehicle_type,
        actor=actor,
    )
    try:
        with transaction.atomic():
            job = Job.objects.create(
                vehicle=vehicle,
                number_plate=number_plate,
                vehicle_type=locked_vehicle_type,
                job_date=job_date,
                subtotal=quote["subtotal"],
                discount_type=discount_type,
                discount_value=discount_value,
                discount_amount=discount_amount,
                total_price=total_price,
                amount_paid=initial_amount,
                created_by=actor,
                updated_by=actor,
                discount_applied_by=actor if discount_amount > ZERO_MONEY else None,
                idempotency_key=idempotency_key,
                request_fingerprint=request_fingerprint,
            )
    except IntegrityError:
        if idempotency_key is None:
            raise
        existing_job = Job.objects.select_for_update().filter(
            idempotency_key=idempotency_key
        ).first()
        if existing_job is None:
            raise
        if existing_job.request_fingerprint != request_fingerprint:
            raise IdempotencyConflict()
        return existing_job, True

    for line, line_discount in zip(quote["services"], discount_lines):
        JobService.objects.create(
            job=job,
            service=line["service"],
            pricing_record=line["pricing_record"],
            commission_setting=line["commission_setting"],
            price_snapshot=line["price"],
            discount_amount=line_discount,
            commissionable_amount=line["price"] - line_discount,
            commission_rate_snapshot=line["commission_rate"],
        )
    for worker in locked_workers:
        JobWorkerAssignment.objects.create(job=job, worker=worker)

    if initial_amount > ZERO_MONEY:
        try:
            with transaction.atomic():
                JobPayment.objects.create(
                    job=job,
                    amount=initial_amount,
                    method=initial_payment["method"],
                    payment_date=initial_payment["payment_date"],
                    notes=initial_payment.get("notes", ""),
                    recorded_by=actor,
                    idempotency_key=idempotency_key,
                )
        except IntegrityError:
            if JobPayment.objects.filter(idempotency_key=idempotency_key).exists():
                raise IdempotencyConflict()
            raise
    return job, False


def _get_or_create_vehicle(*, number_plate, vehicle_type, actor):
    vehicle = Vehicle.objects.select_for_update().filter(
        number_plate=number_plate
    ).first()
    if vehicle is not None:
        if vehicle.vehicle_type_id != vehicle_type.pk:
            vehicle.vehicle_type = vehicle_type
            vehicle.save(update_fields={"vehicle_type", "updated_at"})
        return vehicle
    try:
        with transaction.atomic():
            return Vehicle.objects.create(
                number_plate=number_plate,
                vehicle_type=vehicle_type,
                registered_by=actor,
            )
    except IntegrityError:
        vehicle = Vehicle.objects.select_for_update().get(number_plate=number_plate)
        if vehicle.vehicle_type_id != vehicle_type.pk:
            vehicle.vehicle_type = vehicle_type
            vehicle.save(update_fields={"vehicle_type", "updated_at"})
        return vehicle


def allocate_discount(lines, discount_amount, subtotal):
    if discount_amount == ZERO_MONEY or subtotal == ZERO_MONEY:
        return [ZERO_MONEY for _ in lines]

    subtotal_cents = int((subtotal / ONE_CENT).to_integral_value())
    discount_cents = int((discount_amount / ONE_CENT).to_integral_value())
    line_cents = [
        int((line["price"] / ONE_CENT).to_integral_value())
        for line in lines
    ]
    allocations = []
    remainders = []
    for index, price_cents in enumerate(line_cents):
        allocation, remainder = divmod(discount_cents * price_cents, subtotal_cents)
        allocations.append(allocation)
        remainders.append((remainder, str(lines[index]["service"].pk), index))

    remaining = discount_cents - sum(allocations)
    for _remainder, _service_id, index in sorted(
        remainders,
        key=lambda item: (-item[0], item[1]),
    )[:remaining]:
        allocations[index] += 1
    return [Decimal(cents) * ONE_CENT for cents in allocations]


@transaction.atomic
def transition_job(*, job_id, target_status, actor):
    job = Job.objects.select_for_update().get(pk=job_id)
    now = timezone.now()

    if target_status == Job.Status.IN_PROGRESS:
        if job.status != Job.Status.PENDING:
            raise serializers.ValidationError(
                {"status": "Only pending jobs can be started."}
            )
        job.status = Job.Status.IN_PROGRESS
        job.washing_started_at = now
        update_fields = {"status", "washing_started_at"}
    elif target_status == Job.Status.COMPLETED:
        if job.status != Job.Status.IN_PROGRESS:
            raise serializers.ValidationError(
                {"status": "Only in-progress jobs can be completed."}
            )
        job_services = list(job.job_services.select_for_update().all())
        if not job_services or any(
            item.price_snapshot is None
            or item.commission_rate_snapshot is None
            or item.commissionable_amount is None
            for item in job_services
        ):
            raise serializers.ValidationError(
                {"services": "Job price and commission snapshots are incomplete."}
            )
        assignments = list(
            job.worker_assignments.select_for_update()
            .order_by("worker_id")
        )
        if not assignments:
            raise serializers.ValidationError(
                {"workers": "Completed jobs must have at least one assigned worker."}
            )
        commission_per_worker = ZERO_MONEY
        for item in job_services:
            commission_amount_per_worker = (
                item.commissionable_amount
                * item.commission_rate_snapshot
                / Decimal("100")
            ).quantize(ONE_CENT, rounding=ROUND_HALF_UP)
            item.commission_amount = (
                commission_amount_per_worker * len(assignments)
            )
            item.save(update_fields={"commission_amount", "updated_at"})
            commission_per_worker += commission_amount_per_worker
        total_commission = ZERO_MONEY
        for assignment in assignments:
            assignment.commission_amount = commission_per_worker
            assignment.save(update_fields={"commission_amount", "updated_at"})
            total_commission += assignment.commission_amount

        commission_base = sum(
            (item.commissionable_amount for item in job_services),
            ZERO_MONEY,
        )
        commission_setting = next(
            (item.commission_setting for item in job_services if item.commission_setting),
            None,
        )
        allocation_policy = (
            commission_setting.allocation_policy
            if commission_setting is not None
            else CommissionSetting.AllocationPolicy.PER_WORKER
        )
        commission_rates = {
            item.commission_rate_snapshot for item in job_services
        }
        commission_rate = (
            next(iter(commission_rates)) if len(commission_rates) == 1 else None
        )
        for assignment in assignments:
            CommissionLedgerEntry.objects.create(
                worker=assignment.worker,
                job=job,
                assignment=assignment,
                entry_type=CommissionLedgerEntry.EntryType.EARNED,
                amount=assignment.commission_amount,
                effective_date=timezone.localdate(now),
                reason=f"Commission earned on completed job {job.number_plate or job.pk}.",
                commission_base_snapshot=commission_base,
                commission_rate_snapshot=commission_rate,
                allocation_policy_snapshot=allocation_policy,
                allocation_worker_count_snapshot=len(assignments),
                recorded_by=actor,
            )

        job.status = Job.Status.COMPLETED
        job.completed_at = now
        job.commission_amount = total_commission
        update_fields = {"status", "completed_at", "commission_amount"}
    elif target_status == Job.Status.CANCELLED:
        if job.status not in {Job.Status.PENDING, Job.Status.IN_PROGRESS}:
            raise serializers.ValidationError(
                {"status": "Only pending or in-progress jobs can be cancelled."}
            )
        job.status = Job.Status.CANCELLED
        job.cancelled_at = now
        update_fields = {"status", "cancelled_at"}
    else:
        raise serializers.ValidationError({"status": "Unsupported job transition."})

    job.updated_by = actor
    update_fields.update({"updated_by", "updated_at"})
    job.save(update_fields=update_fields)
    return job


def money_string(value):
    return f"{value.quantize(ONE_CENT):.2f}"
