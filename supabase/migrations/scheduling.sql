-- ═══════════════════════════════════════════════════════════════════════════
-- ICS Hub — Scheduling Module
-- Run this in the Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schedules
--    One scheduling session (like a Calendly event type)
--    booking_mode : 'system' = pull candidates from DB
--                   'free'   = open form, anyone can book
--    source_type  : 'group'       = all candidates in a group        (system only)
--                   'group_role'  = group filtered by role           (system only)
--                   'role'        = all candidates with a role       (system only)
--                   NULL          = free mode (no source)
--    interview_format: 'in_person' | 'online' | 'hybrid'
--    timezone     : IANA timezone string (e.g. 'Asia/Dubai')
--                   all slots are stored UTC, admin creates in this timezone
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE schedules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  description         TEXT,
  location            TEXT,                         -- room / address / "Online"
  booking_mode        TEXT        NOT NULL DEFAULT 'system'
                                  CHECK (booking_mode IN ('system','free')),
  source_type         TEXT        CHECK (
                                    source_type IS NULL OR
                                    source_type IN ('group','group_role','role')
                                  ),
  group_id            UUID        REFERENCES assessment_groups(id) ON DELETE SET NULL,
  track_id            UUID        REFERENCES role_tracks(id)       ON DELETE SET NULL,
  show_role_selector  BOOLEAN     NOT NULL DEFAULT false,          -- free mode only
  interview_format    TEXT        NOT NULL DEFAULT 'in_person'
                                  CHECK (interview_format IN ('in_person','online','hybrid')),
  timezone            TEXT        NOT NULL DEFAULT 'Asia/Dubai',   -- admin's timezone
  slot_duration_min   INTEGER     NOT NULL DEFAULT 30 CHECK (slot_duration_min > 0),
  buffer_min          INTEGER     NOT NULL DEFAULT 0  CHECK (buffer_min >= 0),
  capacity_per_slot   INTEGER     NOT NULL DEFAULT 1  CHECK (capacity_per_slot > 0),
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('draft','active','closed')),
  -- Microsoft Graph IDs (populated after first booking)
  ms_calendar_id      TEXT,
  created_by          UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_schedules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_schedules_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Schedule Slots
--    Individual bookable time windows within a schedule.
--    All times stored in UTC — display layer converts to any timezone.
--    start_utc + slot_duration_min = end time
--    buffer_min gap is enforced at application level between consecutive slots
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE schedule_slots (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  UUID        NOT NULL REFERENCES schedules(id)   ON DELETE CASCADE,
  track_id     UUID        REFERENCES role_tracks(id)          ON DELETE SET NULL,
                                                               -- NULL = any track
  start_utc    TIMESTAMPTZ NOT NULL,
  end_utc      TIMESTAMPTZ NOT NULL,
  capacity     INTEGER     NOT NULL DEFAULT 1 CHECK (capacity > 0),
  is_blocked   BOOLEAN     NOT NULL DEFAULT false,             -- admin manual block
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT slots_end_after_start CHECK (end_utc > start_utc)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Schedule Bookings
--    One row per confirmed booking.
--    candidate_id is set for system-mode bookings (already in DB).
--    candidate_name + candidate_email are used for free-mode bookings
--    and as a fallback display for system-mode.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE schedule_bookings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id       UUID        NOT NULL REFERENCES schedules(id)            ON DELETE CASCADE,
  slot_id           UUID        NOT NULL REFERENCES schedule_slots(id)       ON DELETE CASCADE,
  -- System-mode: links to existing candidate
  candidate_id      UUID        REFERENCES interview_candidates(id)          ON DELETE SET NULL,
  -- Free-mode (or fallback display name)
  candidate_name    TEXT        NOT NULL,
  candidate_email   TEXT        NOT NULL,
  candidate_phone   TEXT,
  candidate_track_id UUID       REFERENCES role_tracks(id)                  ON DELETE SET NULL,
  -- Unique code shown on confirmation page & email
  confirmation_code TEXT        NOT NULL UNIQUE DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
  status            TEXT        NOT NULL DEFAULT 'confirmed'
                                CHECK (status IN ('confirmed','cancelled','no_show')),
  notes             TEXT,
  -- Microsoft Graph — populated after calendar event is created
  ms_event_id       TEXT,
  ms_teams_url      TEXT,
  -- Timestamps
  booked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_schedules_group_id        ON schedules(group_id);
CREATE INDEX idx_schedules_track_id        ON schedules(track_id);
CREATE INDEX idx_schedules_status          ON schedules(status);
CREATE INDEX idx_schedules_created_by      ON schedules(created_by);

CREATE INDEX idx_schedule_slots_schedule   ON schedule_slots(schedule_id);
CREATE INDEX idx_schedule_slots_start      ON schedule_slots(start_utc);
CREATE INDEX idx_schedule_slots_track      ON schedule_slots(track_id);

CREATE INDEX idx_schedule_bookings_schedule  ON schedule_bookings(schedule_id);
CREATE INDEX idx_schedule_bookings_slot      ON schedule_bookings(slot_id);
CREATE INDEX idx_schedule_bookings_candidate ON schedule_bookings(candidate_id);
CREATE INDEX idx_schedule_bookings_code      ON schedule_bookings(confirmation_code);
CREATE INDEX idx_schedule_bookings_status    ON schedule_bookings(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. View — slot availability
--    Counts confirmed bookings per slot so the booking page
--    knows which slots are full without a separate query.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW schedule_slot_availability AS
SELECT
  s.id                                                        AS slot_id,
  s.schedule_id,
  s.track_id,
  s.start_utc,
  s.end_utc,
  s.capacity,
  s.is_blocked,
  COALESCE(COUNT(b.id) FILTER (WHERE b.status = 'confirmed'), 0) AS booked_count,
  s.capacity - COALESCE(COUNT(b.id) FILTER (WHERE b.status = 'confirmed'), 0) AS remaining,
  CASE
    WHEN s.is_blocked THEN 'blocked'
    WHEN s.capacity - COALESCE(COUNT(b.id) FILTER (WHERE b.status = 'confirmed'), 0) <= 0 THEN 'full'
    ELSE 'available'
  END                                                         AS availability
FROM schedule_slots s
LEFT JOIN schedule_bookings b ON b.slot_id = s.id
GROUP BY s.id;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE schedules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_bookings ENABLE ROW LEVEL SECURITY;

-- Schedules: authenticated admin users can do everything
CREATE POLICY "Admins full access to schedules"
  ON schedules FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Slots: authenticated admin users can do everything
CREATE POLICY "Admins full access to slots"
  ON schedule_slots FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Bookings: authenticated admin users can do everything
CREATE POLICY "Admins full access to bookings"
  ON schedule_bookings FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Public (anon): can READ available slots (for the booking page)
CREATE POLICY "Public can read slots"
  ON schedule_slots FOR SELECT
  TO anon
  USING (true);

-- Public (anon): can READ schedule info (for the booking page header)
CREATE POLICY "Public can read schedules"
  ON schedules FOR SELECT
  TO anon
  USING (status = 'active');

-- Public (anon): can INSERT a booking (candidate confirming a slot)
CREATE POLICY "Public can create bookings"
  ON schedule_bookings FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public (anon): can read their own booking by confirmation code
CREATE POLICY "Public can read own booking"
  ON schedule_bookings FOR SELECT
  TO anon
  USING (true);
