-- Isolated test fixtures for scripts/deploy-checks (never touches real rows).
-- Creates a temp admin (pm.admin.temp@icsaviation.test) and ZZ TEST courses.
-- Remove everything afterwards with cleanup.sql.
with admin as (
  insert into admin_users (email, name, password_hash, role, is_active)
  values ('pm.admin.temp@icsaviation.test', 'PM Test Admin Temp', '$2b$12$m4ZVTGk67sX7BLJF6QPDVesRu8.pcg6muxegkmXcjZzMYDnFTIG9u', 'admin', true)
  returning id
), courses as (
  insert into lms_courses (title, status, final_exam_pass_mark, certificate_enabled, certificate_auto_release, feedback_enabled, progress_enforcement, delivery_mode)
  values ('ZZ TEST Course A (General)', 'published', 70, true, false, false, false, 'onsite'),
         ('ZZ TEST Course B (Ops)', 'published', 70, true, false, false, false, 'onsite'),
         ('ZZ TEST Course C (Ops 2)', 'published', 70, true, false, false, false, 'online')
  returning id, title
), mods as (
  insert into lms_modules (course_id, title, module_type, order_index, is_mandatory, questions, activity_settings)
  select c.id, 'ZZ TEST Package', 'package', 0, true, null::jsonb, null::jsonb from courses c
  union all
  select c.id, 'ZZ TEST Classroom', 'live_session', 1, false, null::jsonb, null::jsonb from courses c where c.title not like '%Course C%'
  union all
  select c.id, 'ZZ TEST Final Exam', 'final_exam', 2, true,
    '[{"id":"q1","type":"mcq_single","text":"TEST Q1","points":1,"options":[{"id":"a","text":"Right","correct":true},{"id":"b","text":"Wrong","correct":false}]},
      {"id":"q2","type":"mcq_single","text":"TEST Q2","points":1,"options":[{"id":"a","text":"Right","correct":true},{"id":"b","text":"Wrong","correct":false}]},
      {"id":"q3","type":"mcq_single","text":"TEST Q3","points":1,"options":[{"id":"a","text":"Right","correct":true},{"id":"b","text":"Wrong","correct":false}]}]'::jsonb,
    '{"pass_mark":70,"max_attempts":3,"time_limit_minutes":null}'::jsonb
  from courses c
  returning id, course_id, module_type
), pkgs as (
  insert into lms_packages (course_id, module_id, title, pass_mark)
  select m.course_id, m.id, 'Package', 70 from mods m where m.module_type = 'package'
  returning id
), items as (
  insert into lms_package_items (package_id, type, title, config, required, order_index)
  select p.id, 'text', 'TEST slide ' || g, '{"html":"<p>Test</p>"}'::jsonb, true, g - 1 from pkgs p, generate_series(1,2) g
  returning id
)
select (select count(*) from courses) courses, (select count(*) from items) items, (select count(*) from admin) admins;
