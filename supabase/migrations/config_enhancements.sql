-- Migration: Config Enhancements
-- Run in Supabase SQL editor

-- 1. Insight Thresholds — per-pillar score flags (Top Strength / Watch List / Development Area)
ALTER TABLE assessment_configs
  ADD COLUMN IF NOT EXISTS insight_thresholds JSONB
  DEFAULT '[
    {"key": "top_strength",     "label": "Top Strength",     "min": 4.00, "max": 5.00},
    {"key": "watch_list",       "label": "Watch List",       "min": 2.50, "max": 3.99},
    {"key": "development_area", "label": "Development Area", "min": 1.00, "max": 2.49}
  ]';

-- Backfill any existing configs that have null
UPDATE assessment_configs
SET insight_thresholds = '[
    {"key": "top_strength",     "label": "Top Strength",     "min": 4.00, "max": 5.00},
    {"key": "watch_list",       "label": "Watch List",       "min": 2.50, "max": 3.99},
    {"key": "development_area", "label": "Development Area", "min": 1.00, "max": 2.49}
  ]'
WHERE insight_thresholds IS NULL;

-- 2. Rater Divergence Threshold — flag when assessors disagree by more than X on any competency
--    e.g. 1.5 means: if two assessors score the same competency 2.0 vs 3.6 → flagged in report
ALTER TABLE assessment_configs
  ADD COLUMN IF NOT EXISTS rater_divergence_threshold NUMERIC(3,1) DEFAULT 1.5;

-- 3. Per-pillar knockout threshold — if a candidate's pillar score drops below this,
--    their final verdict becomes Fail regardless of overall average (aviation safety critical)
ALTER TABLE pillars
  ADD COLUMN IF NOT EXISTS knockout_threshold NUMERIC(3,1) DEFAULT NULL;
-- NULL = no knockout enforced on this pillar
-- 3.0  = candidate must score ≥ 3.0 on this pillar or they auto-fail
