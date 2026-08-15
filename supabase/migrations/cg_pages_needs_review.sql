-- Marks a slide that shipped with an open geometric/QA defect because the
-- retry budget (MAX_QA_RETRIES in orchestrator.ts) ran out before the design
-- agent resolved it. Previously that state left no trace on the row — the
-- slide looked identical to one that passed cleanly, and the only way to
-- find it was scrolling the finished deck by eye.

alter table if exists public.cg_pages
  add column if not exists needs_review boolean not null default false;
