-- ═══════════════════════════════════════════════════════════════════════════
-- RLS Hardening Migration
-- ───────────────────────────────────────────────────────────────────────────
-- The application exclusively uses the service_role key (server-side only),
-- which bypasses RLS. The anon key is exposed in the browser bundle and must
-- be locked down so direct REST API calls cannot access any data.
--
-- Strategy:
--   • Enable RLS on every table that was missing it
--   • Drop all overly-permissive anon policies
--   • Keep admin (authenticated) policies — defensive in depth
--   • Service role bypasses RLS → app is completely unaffected
--
-- Run this in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXAM PLATFORM tables (schema.sql) — enable RLS, no anon access needed
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE admin_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups               ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams                ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_custom_fields   ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE choices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_pairs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordering_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_answers    ENABLE ROW LEVEL SECURITY;

-- Authenticated admins get full access
CREATE POLICY "Admins full access" ON admin_users        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON groups             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON courses            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON exams              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON exam_custom_fields FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON questions          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON choices            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON matching_pairs     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON ordering_items     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON candidates         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON candidate_answers  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- No anon policies — all access goes through server-side API routes using service_role


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INTERVIEW SYSTEM tables (interview_schema.sql) — enable RLS, no anon
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE role_tracks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pillars               ENABLE ROW LEVEL SECURITY;
ALTER TABLE competencies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_candidates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assessors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores                ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access" ON role_tracks          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON assessment_configs   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON pillars              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON competencies         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON assessment_groups    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON interview_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON group_assessors      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access" ON scores               FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SCHEDULING tables — drop overly-permissive anon policies
-- ─────────────────────────────────────────────────────────────────────────────

-- schedule_bookings: drop anon SELECT (leaked all PII) and anon UPDATE
-- (allowed anyone to overwrite rsvp_status on any booking)
DROP POLICY IF EXISTS "Public can read own booking"        ON schedule_bookings;
DROP POLICY IF EXISTS "Public can create bookings"         ON schedule_bookings;
DROP POLICY IF EXISTS "Public can update own booking rsvp" ON schedule_bookings;

-- schedule_slots: drop anon SELECT (no longer needed — app uses service_role)
DROP POLICY IF EXISTS "Public can read slots"              ON schedule_slots;

-- schedules: drop anon SELECT
DROP POLICY IF EXISTS "Public can read schedules"          ON schedules;

-- Nothing to add back — service_role handles all reads/writes from API routes.
-- Authenticated admin policies (already exist) remain untouched.


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ADDITIONAL scheduling tables added after initial migration
-- ─────────────────────────────────────────────────────────────────────────────

-- slot_pools (added for shared interviewer availability feature)
ALTER TABLE IF EXISTS slot_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Admins full access" ON slot_pools FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- candidate_assessments (added in scoring_v2 migration)
ALTER TABLE IF EXISTS candidate_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Admins full access" ON candidate_assessments FOR ALL TO authenticated USING (true) WITH CHECK (true);
