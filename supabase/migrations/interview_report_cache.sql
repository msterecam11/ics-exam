-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Interview Report Cache
-- Stores AI-generated content so it is generated once and served instantly.
-- Each row = one AI "section" for a specific scope (group / candidate / track).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS interview_report_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope — one of these will be set, others null
  group_id      UUID REFERENCES assessment_groups(id) ON DELETE CASCADE,
  candidate_id  UUID REFERENCES interview_candidates(id) ON DELETE CASCADE,
  track_id      UUID REFERENCES role_tracks(id) ON DELETE CASCADE,

  -- Which AI section this row holds
  -- Individual: executive_summary | verdict_explanation | what_would_change |
  --             profile_interpretation | pillar_story_{pillarId} |
  --             intra_pillar_variance_{pillarId} | divergence_{competencyId} |
  --             red_thread | evidence_tone | qualitative_synthesis |
  --             development_plan | roi_of_development
  -- Track:      track_summary | common_strengths_gaps
  -- Group:      group_narrative | systemic_gap | assessor_bias |
  --             talent_map_commentary | cohort_prediction
  section       TEXT NOT NULL,

  -- The AI-generated text
  content       TEXT NOT NULL,

  -- Model used so we can re-generate if we upgrade
  model         TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',

  -- Timestamps
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups by scope + section
CREATE INDEX IF NOT EXISTS idx_report_cache_group
  ON interview_report_cache (group_id, section)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_cache_candidate
  ON interview_report_cache (candidate_id, section)
  WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_cache_track
  ON interview_report_cache (track_id, section)
  WHERE track_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: only service role can write; authenticated users can read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE interview_report_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read report cache"
  ON interview_report_cache FOR SELECT
  TO authenticated
  USING (true);

-- Writes happen server-side via service role key — no INSERT policy needed
