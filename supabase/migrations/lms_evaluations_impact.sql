-- Onsite phase 7 — the evaluation set, the impact questionnaire and joining
-- instructions. Additive only: new tables and new columns with safe defaults
-- (everything off), so no live course changes until someone switches it on.

-- Course switches.
alter table lms_courses add column if not exists evaluate_modules     boolean not null default false;
alter table lms_courses add column if not exists evaluate_instructors boolean not null default false;
alter table lms_courses add column if not exists impact_enabled       boolean not null default false;

-- What participants of a group need before day one (what to bring, dress
-- code, parking, ID for airside access…). Shown on their group card and
-- e-mailed some days before the start.
alter table lms_course_groups add column if not exists joining_instructions text;

-- One rating per participant per module / per instructor.
create table if not exists lms_evaluations (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references lms_enrollments(id) on delete cascade,
  student_id    uuid not null references lms_students(id) on delete cascade,
  course_id     uuid not null references lms_courses(id) on delete cascade,
  group_id      uuid references lms_course_groups(id) on delete set null,
  subject_type  text not null check (subject_type in ('module', 'instructor')),
  subject_id    uuid not null,
  ratings       jsonb not null default '{}'::jsonb,
  comment       text,
  submitted_at  timestamptz not null default now(),
  unique (enrollment_id, subject_type, subject_id)
);
create index if not exists idx_lms_evaluations_course on lms_evaluations(course_id);
create index if not exists idx_lms_evaluations_group  on lms_evaluations(group_id);
alter table lms_evaluations enable row level security;

-- The questionnaire some months after the course: did it change the work?
-- impact_score (0–100) is its own measure and never affects completion or
-- the certificate.
create table if not exists lms_impact_responses (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references lms_enrollments(id) on delete cascade,
  student_id    uuid not null references lms_students(id) on delete cascade,
  course_id     uuid not null references lms_courses(id) on delete cascade,
  group_id      uuid references lms_course_groups(id) on delete set null,
  answers       jsonb not null default '{}'::jsonb,
  impact_score  integer check (impact_score between 0 and 100),
  submitted_at  timestamptz not null default now()
);
create index if not exists idx_lms_impact_course on lms_impact_responses(course_id);
alter table lms_impact_responses enable row level security;
