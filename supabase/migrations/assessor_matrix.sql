-- Migration: Assessor × Pillar Weight Matrix
-- Run in Supabase SQL editor

-- Each assessor in a group has a per-pillar weight (0–100).
-- 0   = assessor does NOT score this pillar (excluded from its calculation).
-- 1–100 = relative contribution weight when aggregating scores for that pillar.
ALTER TABLE group_assessors
  ADD COLUMN IF NOT EXISTS pillar_weights JSONB NOT NULL DEFAULT '{}';
-- Example value:
-- { "pillar-uuid-1": 100, "pillar-uuid-2": 50, "pillar-uuid-3": 0 }
