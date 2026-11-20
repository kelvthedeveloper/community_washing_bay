import json
import logging
import time
from collections import defaultdict

from django.apps import apps
from django.core import serializers
from django.core.management import BaseCommand, CommandError, call_command
from django.core.management.color import no_style
from django.db import IntegrityError, OperationalError, connections, transaction
from django.db.models import ForeignKey, OneToOneField
from django.utils import timezone


logger = logging.getLogger(__name__)
STATE_TABLE = "offline_sync_state"
META_TABLE = "offline_sync_meta"


class SyncConflict(Exception):
    def __init__(self, conflicts):
        self.conflicts = conflicts
        super().__init__(f"Synchronization paused for {len(conflicts)} conflict(s).")


class Command(BaseCommand):
    help = "Continuously synchronize the local SQLite database with Supabase."

    def add_arguments(self, parser):
        parser.add_argument(
            "--watch",
            action="store_true",
            help="Retry synchronization continuously when offline or conflicted.",
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=30,
            help="Seconds between synchronization attempts in watch mode.",
        )
        parser.add_argument(
            "--allow-offline",
            action="store_true",
            help="Start with the existing local database if a previous sync succeeded.",
        )

    def handle(self, *args, **options):
        if "supabase" not in connections.databases:
            raise CommandError("Configure DATABASE_URL before synchronizing Supabase.")
        if options["interval"] < 1:
            raise CommandError("--interval must be at least one second.")

        migrations_applied = False
        while True:
            try:
                if not migrations_applied:
                    call_command(
                        "migrate",
                        database="supabase",
                        interactive=False,
                        verbosity=0,
                    )
                    migrations_applied = True
                self.sync_once()
            except OperationalError as exc:
                self._set_meta("last_error", str(exc))
                logger.warning(
                    "Database synchronization could not connect; local SQLite remains active: %s",
                    exc,
                )
                if options["allow_offline"] and self._get_meta("last_success_at"):
                    return
                if not options["watch"]:
                    raise CommandError(
                        "Supabase is unavailable; local data is unchanged."
                    ) from exc
            except SyncConflict as exc:
                self._set_meta(
                    "last_conflict",
                    json.dumps(exc.conflicts, sort_keys=True),
                )
                logger.error("%s Conflicts: %s", exc, exc.conflicts)
                if options["allow_offline"]:
                    return
                if not options["watch"]:
                    raise CommandError(str(exc)) from exc
            except IntegrityError as exc:
                details = [{"reason": "A database constraint rejected synchronization."}]
                self._set_meta("last_conflict", json.dumps(details))
                logger.exception("Database synchronization stopped on a constraint conflict.")
                if options["allow_offline"]:
                    return
                if not options["watch"]:
                    raise CommandError(details[0]["reason"]) from exc
            else:
                self._set_meta("last_error", "")
                self._set_meta("last_conflict", "")
                self._set_meta("last_success_at", timezone.now().isoformat())
                self.stdout.write(
                    self.style.SUCCESS("Local SQLite and Supabase are synchronized.")
                )
                if not options["watch"]:
                    return
            finally:
                connections["supabase"].close()

            time.sleep(options["interval"])

    def sync_once(self):
        self._ensure_state_tables()
        models = ordered_models()
        local = snapshot_database("default", models)
        baseline = read_baseline()
        with transaction.atomic(using="supabase"):
            remote = snapshot_database("supabase", models, lock_rows=True)
            local_changes, remote_changes, next_baseline, conflicts = (
                compare_snapshots(local, remote, baseline)
            )
            if conflicts:
                raise SyncConflict(conflicts)

            validate_references(local_changes, remote, "local")
            validate_references(remote_changes, local, "Supabase")
            apply_changes("supabase", local_changes, remote, models)
        apply_changes("default", remote_changes, local, models)
        write_baseline(next_baseline)

    def _ensure_state_tables(self):
        with connections["default"].cursor() as cursor:
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {STATE_TABLE} (
                    model_label TEXT NOT NULL,
                    object_pk TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (model_label, object_pk)
                )
                """
            )
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {META_TABLE} (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )

    def _set_meta(self, key, value):
        if "default" not in connections.databases:
            return
        self._ensure_state_tables()
        with connections["default"].cursor() as cursor:
            cursor.execute(
                f"INSERT OR REPLACE INTO {META_TABLE} (key, value) VALUES (%s, %s)",
                [key, value],
            )

    def _get_meta(self, key):
        self._ensure_state_tables()
        with connections["default"].cursor() as cursor:
            cursor.execute(
                f"SELECT value FROM {META_TABLE} WHERE key = %s",
                [key],
            )
            result = cursor.fetchone()
        return result[0] if result else None


def ordered_models():
    models = [
        model
        for model in apps.get_models(include_auto_created=True)
        if model._meta.managed and not model._meta.proxy
    ]
    dependencies = {model: set() for model in models}
    for model in models:
        for field in model._meta.concrete_fields:
            if isinstance(field, (ForeignKey, OneToOneField)):
                related_model = field.remote_field.model
                if related_model in dependencies and related_model is not model:
                    dependencies[model].add(related_model)

    ordered = []
    while dependencies:
        ready = sorted(
            (
                model
                for model, required in dependencies.items()
                if not required
            ),
            key=lambda model: model._meta.label_lower,
        )
        if not ready:
            raise CommandError("A model dependency cycle prevents database synchronization.")
        for model in ready:
            ordered.append(model)
            del dependencies[model]
        for required in dependencies.values():
            required.difference_update(ready)
    return ordered


def canonical_payload(record):
    return json.dumps(record, sort_keys=True, separators=(",", ":"))


def snapshot_database(alias, models, *, lock_rows=False):
    snapshot = {}
    for model in models:
        queryset = model._base_manager.using(alias).all().order_by(model._meta.pk.name)
        if lock_rows:
            queryset = queryset.select_for_update()
        records = json.loads(serializers.serialize("json", queryset))
        for record in records:
            key = (model._meta.label_lower, str(record["pk"]))
            snapshot[key] = canonical_payload(record)
    return snapshot


def read_baseline():
    baseline = {}
    with connections["default"].cursor() as cursor:
        cursor.execute(
            f"SELECT model_label, object_pk, payload FROM {STATE_TABLE}"
        )
        for model_label, object_pk, payload in cursor.fetchall():
            baseline[(model_label, object_pk)] = payload
    return baseline


def compare_snapshots(local, remote, baseline):
    local_changes = []
    remote_changes = []
    next_baseline = {}
    conflicts = []

    for key in sorted(set(local) | set(remote) | set(baseline)):
        local_payload = local.get(key)
        remote_payload = remote.get(key)
        baseline_payload = baseline.get(key)

        if local_payload == remote_payload:
            if local_payload is not None:
                next_baseline[key] = local_payload
            continue

        if baseline_payload is None:
            if local_payload is None:
                remote_changes.append((key, remote_payload))
                next_baseline[key] = remote_payload
            elif remote_payload is None:
                local_changes.append((key, local_payload))
                next_baseline[key] = local_payload
            else:
                conflicts.append(key)
            continue

        if local_payload == baseline_payload:
            remote_changes.append((key, remote_payload))
            if remote_payload is not None:
                next_baseline[key] = remote_payload
        elif remote_payload == baseline_payload:
            local_changes.append((key, local_payload))
            if local_payload is not None:
                next_baseline[key] = local_payload
        else:
            conflicts.append(key)

    return local_changes, remote_changes, next_baseline, conflicts


def validate_references(changes, target_snapshot, direction):
    target_keys = set(target_snapshot)
    final_keys = (target_keys | {key for key, payload in changes if payload}) - {
        key for key, payload in changes if payload is None
    }

    for key, payload in changes:
        if payload is None:
            continue
        model = apps.get_model(key[0])
        record = json.loads(payload)
        fields = record["fields"]
        for field in model._meta.concrete_fields:
            if not isinstance(field, (ForeignKey, OneToOneField)):
                continue
            related_pk = fields.get(field.name)
            if related_pk is None:
                continue
            related_key = (field.remote_field.model._meta.label_lower, str(related_pk))
            if related_key not in final_keys:
                raise SyncConflict(
                    [
                        {
                            "model": key[0],
                            "pk": key[1],
                            "reason": (
                                f"{direction} change references missing "
                                f"{related_key[0]}:{related_key[1]}"
                            ),
                        }
                    ]
                )


def apply_changes(alias, changes, target_snapshot, models):
    if not changes:
        return
    grouped = defaultdict(list)
    for key, payload in changes:
        grouped[key[0]].append((key, payload))

    with transaction.atomic(using=alias):
        for model in models:
            entries = grouped.get(model._meta.label_lower, [])
            upserts = [(key, payload) for key, payload in entries if payload is not None]
            validate_target_snapshot(alias, model, entries, target_snapshot)
            save_upserts(alias, model, upserts, target_snapshot)

        for model in reversed(models):
            entries = grouped.get(model._meta.label_lower, [])
            for key, payload in entries:
                if payload is None:
                    pk = model._meta.pk.to_python(key[1])
                    model._base_manager.using(alias).filter(pk=pk).delete()
        reset_sequences(
            alias,
            [
                model
                for model in models
                if grouped.get(model._meta.label_lower)
            ],
        )


def validate_target_snapshot(alias, model, entries, target_snapshot):
    for key, _payload in entries:
        expected = target_snapshot.get(key)
        pk = model._meta.pk.to_python(key[1])
        queryset = model._base_manager.using(alias).filter(pk=pk)
        if alias == "supabase":
            queryset = queryset.select_for_update()
        current = queryset.first()
        actual = None
        if current is not None:
            actual = canonical_payload(
                json.loads(serializers.serialize("json", [current]))[0]
            )
        if actual != expected:
            raise SyncConflict(
                [
                    {
                        "model": key[0],
                        "pk": key[1],
                        "reason": "The target changed during synchronization.",
                    }
                ]
            )


def save_upserts(alias, model, entries, target_snapshot):
    pending = {key: payload for key, payload in entries}
    creates = {key for key in pending if key not in target_snapshot}
    while pending:
        ready = []
        for key, payload in pending.items():
            record = json.loads(payload)
            fields = record["fields"]
            waiting_on_new_self_reference = False
            for field in model._meta.concrete_fields:
                if not isinstance(field, (ForeignKey, OneToOneField)):
                    continue
                if field.remote_field.model is not model:
                    continue
                related_pk = fields.get(field.name)
                related_key = (model._meta.label_lower, str(related_pk))
                if related_pk is not None and related_key in pending:
                    waiting_on_new_self_reference = True
                    break
            if not waiting_on_new_self_reference:
                ready.append((key, payload))

        if not ready:
            raise CommandError(
                f"A self-reference cycle prevents synchronizing {model._meta.label}."
            )
        for key, payload in ready:
            deserialized = serializers.deserialize("json", f"[{payload}]")
            for item in deserialized:
                item.save(
                    using=alias,
                    save_m2m=False,
                    force_insert=key in creates,
                )
            del pending[key]


def write_baseline(baseline):
    current = read_baseline()
    with transaction.atomic(using="default"):
        with connections["default"].cursor() as cursor:
            for key, payload in current.items():
                if key not in baseline:
                    cursor.execute(
                        f"DELETE FROM {STATE_TABLE} "
                        "WHERE model_label = %s AND object_pk = %s",
                        key,
                    )
            for key, payload in baseline.items():
                if current.get(key) != payload:
                    cursor.execute(
                        f"INSERT OR REPLACE INTO {STATE_TABLE} "
                        "(model_label, object_pk, payload) VALUES (%s, %s, %s)",
                        [key[0], key[1], payload],
                    )


def reset_sequences(alias, models):
    connection = connections[alias]
    with connection.cursor() as cursor:
        for statement in connection.ops.sequence_reset_sql(no_style(), models):
            cursor.execute(statement)
