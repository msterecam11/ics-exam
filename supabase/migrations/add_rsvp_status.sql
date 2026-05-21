-- ─────────────────────────────────────────────────────────────────────────────
-- Add candidate RSVP status to schedule_bookings
--
-- rsvp_status: candidate's own response — separate from admin `status`
--   pending   → no response yet (default)
--   accepted  → candidate confirmed attendance (in-app OR calendar accept)
--   tentative → candidate marked as tentative in calendar
--   declined  → candidate declined (in-app OR calendar decline)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE schedule_bookings
  ADD COLUMN IF NOT EXISTS rsvp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (rsvp_status IN ('pending', 'accepted', 'tentative', 'declined'));

-- Allow public (anon) to update rsvp_status via confirmation code.
-- The API validates the confirmation code before writing — the code
-- itself is the security token.
CREATE POLICY "Public can update own booking rsvp"
  ON schedule_bookings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
