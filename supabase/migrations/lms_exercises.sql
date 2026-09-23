-- Onsite Phase 5 — assignments and exercises INSIDE a module, and the
-- instructor's marks for exercises. Additive.

-- An assignment or exercise can belong to a module (shown nested under it:
-- "Module 2 → Exercise 2.1, Assignment 2.2").
alter table lms_modules add column if not exists parent_module_id uuid references lms_modules(id) on delete set null;
create index if not exists lms_modules_parent_idx on lms_modules(parent_module_id);

-- A new module type: an exercise — practical work the instructor watches and
-- marks (pass / not passed, or a rubric). Nothing is submitted.
alter table lms_modules drop constraint if exists lms_modules_module_type_check;
alter table lms_modules add constraint lms_modules_module_type_check
  check (module_type = any (array['content', 'video', 'quiz', 'assignment', 'final_exam', 'package', 'hubcraft', 'live_session', 'exercise']));

-- One mark per participant per exercise (per enrolment — a retake is a new one).
create table if not exists lms_exercise_results (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references lms_enrollments(id) on delete cascade,
  student_id     uuid not null references lms_students(id) on delete cascade,
  module_id      uuid not null references lms_modules(id) on delete cascade,
  passed         boolean not null,
  score_pct      numeric check (score_pct is null or (score_pct >= 0 and score_pct <= 100)),
  ratings        jsonb,          -- rubric: { "<criterion id>": points | true/false }
  comment        text,
  marked_by      uuid,
  marked_at      timestamptz not null default now(),
  unique (enrollment_id, module_id)
);
create index if not exists lms_exercise_results_module_idx on lms_exercise_results(module_id);
alter table lms_exercise_results enable row level security;
