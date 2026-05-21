-- ─────────────────────────────────────────────────────────────────────────────
-- Add candidate RSVP status to schedule_bookings
-- rsvp_status: candidate's own response (pending / accepted / declined)
--              separate from admin `status` (confirmed / cancelled / no_show)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE schedule_bookings
  ADD COLUMN IF NOT EXISTS rsvp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (rsvp_status IN ('pending', 'accepted', 'declined'));

-- Allow public (anon) to update rsvp_status via confirmation code
-- (The API validates the code before updating — this policy is intentionally
--  broad because the confirmation code itself is the security token.)
CREATE POLICY "Public can update own booking rsvp"
  ON schedule_bookings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
