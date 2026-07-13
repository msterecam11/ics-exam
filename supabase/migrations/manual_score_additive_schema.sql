-- Manual Score (client report) feature — purely additive, no changes to any
-- existing table's meaning. The real submitted candidate_answers/total_score
-- are never touched; this is a parallel, versioned override layer.

-- One row per VERSION of a candidate's manual score. Never updated in place —
-- editing inserts a new row and marks the old one 'superseded'; deleting marks
-- 'deleted'. Never hard-deleted, ever — this is what guarantees a released
-- version can never actually disappear from the database.
CREATE TABLE manual_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  target_score NUMERIC(5,2) NOT NULL,
  achieved_score NUMERIC(5,2) NOT NULL,
  is_exact_match BOOLEAN NOT NULL,
  is_identical_to_original BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','superseded','deleted')),
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_manual_scores_candidate ON manual_scores(candidate_id);

-- Exactly which real answers were overridden for one manual_scores version,
-- and to what. Untouched questions simply have no row here and fall back to
-- the real value everywhere they're read.
CREATE TABLE manual_score_answer_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_score_id UUID NOT NULL REFERENCES manual_scores(id) ON DELETE CASCADE,
  candidate_answer_id UUID NOT NULL REFERENCES candidate_answers(id) ON DELETE CASCADE,
  original_score_achieved NUMERIC(6,2) NOT NULL,
  manual_score_achieved NUMERIC(6,2) NOT NULL,
  UNIQUE (manual_score_id, candidate_answer_id)
);
CREATE INDEX idx_manual_score_overrides_score ON manual_score_answer_overrides(manual_score_id);

-- One row every time a Manual Release actually sends. This IS the audit
-- record — untouched by later edits/deletes of the manual_scores row it
-- points to, so "what was actually sent" is permanently reconstructable.
CREATE TABLE manual_score_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_score_id UUID NOT NULL REFERENCES manual_scores(id) ON DELETE RESTRICT,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  released_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_sent_to TEXT,
  snapshot JSONB NOT NULL
);
CREATE INDEX idx_manual_score_releases_candidate ON manual_score_releases(candidate_id);

-- report_cache.type widened (additive) so the manual narrative can reuse the
-- same cache table, keyed by manual_score_id as reference_id — this is what
-- makes "editing clears the old narrative" automatic: a new manual score
-- version has a new id, so the old cached row is simply orphaned.
ALTER TABLE report_cache DROP CONSTRAINT report_cache_type_check;
ALTER TABLE report_cache ADD CONSTRAINT report_cache_type_check
  CHECK (type = ANY (ARRAY['candidate','course','group','candidate_manual']));
