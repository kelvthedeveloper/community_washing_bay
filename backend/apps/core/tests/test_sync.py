from django.test import SimpleTestCase

from apps.core.management.commands.sync_supabase import compare_snapshots


class DatabaseSyncTests(SimpleTestCase):
    def test_local_changes_are_queued_for_supabase(self):
        key = ("configuration.service", "service-1")

        local_changes, remote_changes, next_baseline, conflicts = compare_snapshots(
            {key: "local-update"},
            {key: "shared-value"},
            {key: "shared-value"},
        )

        self.assertEqual(local_changes, [(key, "local-update")])
        self.assertEqual(remote_changes, [])
        self.assertEqual(next_baseline, {key: "local-update"})
        self.assertEqual(conflicts, [])

    def test_remote_changes_are_pulled_into_local(self):
        key = ("configuration.service", "service-1")

        local_changes, remote_changes, next_baseline, conflicts = compare_snapshots(
            {key: "shared-value"},
            {key: "remote-update"},
            {key: "shared-value"},
        )

        self.assertEqual(local_changes, [])
        self.assertEqual(remote_changes, [(key, "remote-update")])
        self.assertEqual(next_baseline, {key: "remote-update"})
        self.assertEqual(conflicts, [])

    def test_divergent_updates_pause_sync(self):
        key = ("configuration.service", "service-1")

        local_changes, remote_changes, next_baseline, conflicts = compare_snapshots(
            {key: "local-update"},
            {key: "remote-update"},
            {key: "shared-value"},
        )

        self.assertEqual(local_changes, [])
        self.assertEqual(remote_changes, [])
        self.assertEqual(next_baseline, {})
        self.assertEqual(conflicts, [key])

    def test_matching_concurrent_updates_converge_without_conflict(self):
        key = ("configuration.service", "service-1")

        local_changes, remote_changes, next_baseline, conflicts = compare_snapshots(
            {key: "same-update"},
            {key: "same-update"},
            {key: "shared-value"},
        )

        self.assertEqual(local_changes, [])
        self.assertEqual(remote_changes, [])
        self.assertEqual(next_baseline, {key: "same-update"})
        self.assertEqual(conflicts, [])

    def test_one_sided_deletion_is_replicated(self):
        key = ("configuration.service", "service-1")

        local_changes, remote_changes, next_baseline, conflicts = compare_snapshots(
            {},
            {key: "shared-value"},
            {key: "shared-value"},
        )

        self.assertEqual(local_changes, [(key, None)])
        self.assertEqual(remote_changes, [])
        self.assertEqual(next_baseline, {})
        self.assertEqual(conflicts, [])
