# Deploy day — enrollment-based records (retakes)

Changes database **rules only**. No student, progress, exam, certificate or
report row is added, changed or deleted.

Dry-run on 2026-09-17 against the live schema (all changes rolled back): swap
and undo both ran, row counts identical.

## Order

1. Backup the database (Supabase dashboard → Database → Backups).
2. Redeploy the app on Render and wait until it's live.
3. `01_row_counts.sql` — save the result.
4. `02_swap.sql` — stops without changing anything if the data isn't as expected.
5. `01_row_counts.sql` again — must match step 3 exactly.
6. Retake test (isolated test data only), from `ics-exam/`:
   - `scripts/deploy-checks/fixtures.sql`
   - `npm run dev`, then `AFTER_SWAP=1 node scripts/deploy-checks/retake_e2e.mjs`, expecting 0 failed
   - `scripts/deploy-checks/cleanup.sql`, expecting 0 test rows and the same real totals
7. If anything is wrong: `03_undo.sql` (works while no real retake exists yet).

## Kept on purpose

- `lms_report_assessments.enrollment_id` stays optional: 2 older expert reports
  belong to students whose enrollment was later removed.
- `lms_attendance` keeps its one-mark-per-session rule.
