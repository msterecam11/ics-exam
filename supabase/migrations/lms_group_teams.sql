-- Teams inside an onsite group: team work (portfolios, a capstone board) is
-- submitted once and marked once for every member. Additive.
create table if not exists lms_group_teams (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references lms_course_groups(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_lms_group_teams_group on lms_group_teams(group_id);
alter table lms_group_teams enable row level security;
alter table lms_enrollments add column if not exists team_id uuid references lms_group_teams(id) on delete set null;
