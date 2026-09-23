-- Onsite Phase 2 — Groups and Materials. All additive: older code ignores the
-- new tables and columns.
--
-- A GROUP is one scheduled delivery of a course (dates, venue, provider,
-- staff, seats). Its days are ordinary lms_sessions rows with group_id set, so
-- attendance works unchanged. A participant's enrolment points at its group.

create table if not exists lms_course_groups (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references lms_courses(id) on delete restrict,
  name          text,
  provider_id   uuid references lms_service_providers(id) on delete set null,
  start_date    date not null,
  end_date      date not null,
  daily_start   time,
  daily_end     time,
  city          text,
  country       text,
  venue_name    text,
  venue_address text,
  map_url       text,
  seats         integer check (seats is null or seats > 0),
  language      text,
  status        text not null default 'planned'
                check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists lms_course_groups_course_idx on lms_course_groups(course_id);

-- Staff per group. A group can have several instructors (and facilitators,
-- used from Phase 3).
create table if not exists lms_group_staff (
  group_id   uuid not null references lms_course_groups(id) on delete cascade,
  user_id    uuid not null references admin_users(id) on delete cascade,
  role       text not null default 'instructor' check (role in ('instructor', 'facilitator')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id, role)
);
create index if not exists lms_group_staff_user_idx on lms_group_staff(user_id);

alter table lms_enrollments     add column if not exists group_id uuid references lms_course_groups(id) on delete set null;
alter table lms_sessions        add column if not exists group_id uuid references lms_course_groups(id) on delete restrict;
alter table lms_course_requests add column if not exists group_id uuid references lms_course_groups(id) on delete set null;
create index if not exists lms_enrollments_group_idx on lms_enrollments(group_id);
create index if not exists lms_sessions_group_idx    on lms_sessions(group_id);

-- Materials: course-wide, per module, or per group. Files live in the private
-- lms-materials bucket and are only reached through short signed links.
create table if not exists lms_materials (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references lms_courses(id) on delete cascade,
  module_id      uuid references lms_modules(id) on delete set null,
  group_id       uuid references lms_course_groups(id) on delete cascade,
  title          text not null,
  description    text,
  storage_path   text not null,
  file_name      text not null,
  mime_type      text,
  size_bytes     bigint not null default 0,
  available_from text not null default 'enrolment'
                 check (available_from in ('enrolment', 'start', 'completion')),
  order_index    integer not null default 0,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists lms_materials_course_idx on lms_materials(course_id);
create index if not exists lms_materials_group_idx  on lms_materials(group_id);

-- Who downloaded what, and when — "did they receive the material".
create table if not exists lms_material_downloads (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references lms_students(id) on delete cascade,
  enrollment_id uuid references lms_enrollments(id) on delete set null,
  course_id     uuid not null references lms_courses(id) on delete cascade,
  material_id   uuid references lms_materials(id) on delete set null,   -- deleting a file keeps who took it
  label         text,
  via_zip       boolean not null default false,
  downloaded_at timestamptz not null default now()
);
create index if not exists lms_material_downloads_enr_idx on lms_material_downloads(enrollment_id);

-- Per module: may participants download the module's slide PDFs? (Viewing
-- in the LMS is unaffected.) Default yes.
alter table lms_packages add column if not exists slides_downloadable boolean not null default true;

-- Private bucket for materials. 50 MB per file (the plan's limit).
insert into storage.buckets (id, name, public, file_size_limit)
values ('lms-materials', 'lms-materials', false, 52428800)
on conflict (id) do nothing;

-- Same as every other LMS table: row-level security on, no policies — only the
-- server (service role) reads or writes them.
alter table lms_course_groups      enable row level security;
alter table lms_group_staff        enable row level security;
alter table lms_materials          enable row level security;
alter table lms_material_downloads enable row level security;
