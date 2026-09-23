-- Onsite Phase 3 — facilitators, check-in/check-out, online attendance.
-- Additive: older code ignores the new columns and table.

-- A facilitator runs the room: attendance for the groups assigned to them,
-- nothing else.
alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users add constraint admin_users_role_check
  check (role = any (array['admin', 'instructor', 'assessor', 'viewer', 'facilitator']));

-- Attendance in hours as well as days: when they arrived and left, or — for an
-- online session — the minutes the meeting report says they were in.
alter table lms_attendance add column if not exists check_in_at      timestamptz;
alter table lms_attendance add column if not exists check_out_at     timestamptz;
alter table lms_attendance add column if not exists minutes_attended integer check (minutes_attended is null or minutes_attended >= 0);
alter table lms_attendance add column if not exists source           text not null default 'manual'
  check (source in ('manual', 'import'));

-- "Join" clicks on an online session (proof they tried to join — not that
-- they stayed; the meeting report import says that).
create table if not exists lms_session_joins (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references lms_sessions(id) on delete cascade,
  student_id uuid not null references lms_students(id) on delete cascade,
  joined_at  timestamptz not null default now()
);
create index if not exists lms_session_joins_session_idx on lms_session_joins(session_id);
alter table lms_session_joins enable row level security;
