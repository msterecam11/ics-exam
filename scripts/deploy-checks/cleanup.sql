-- Removes every row created by fixtures.sql and the deploy-check scripts.
-- Stops (and deletes nothing) if any real student, course or program is linked
-- to the test data. Ends with counts that must show zero test rows.
do $$
declare
  test_students uuid[] := array(select id from lms_students where email like 'pm.student%.temp@icsaviation.test');
  test_courses  uuid[] := array(select id from lms_courses where title like 'ZZ TEST Course %');
  test_programs uuid[] := array(select id from lms_programs where name like 'ZZ TEST Program%');
  test_admin    uuid[] := array(select id from admin_users where email like 'pm.admin%.temp@icsaviation.test' or email like 'pm.viewer%.temp@icsaviation.test');
begin
  if exists (select 1 from lms_enrollments where course_id = any(test_courses) and not (student_id = any(test_students))) then raise exception 'ABORT: non-test student in test course'; end if;
  if exists (select 1 from lms_enrollments where student_id = any(test_students) and not (course_id = any(test_courses))) then raise exception 'ABORT: test student in real course'; end if;
  if exists (select 1 from lms_program_members where program_id = any(test_programs) and not (student_id = any(test_students))) then raise exception 'ABORT: non-test student in test program'; end if;
  if exists (select 1 from lms_program_items where program_id = any(test_programs) and not (course_id = any(test_courses))) then raise exception 'ABORT: real course in test program'; end if;
  delete from lms_report_cache        where cache_key like any (array(select '%' || id::text || '%' from unnest(test_programs || test_courses) id));
  delete from lms_scoped_assessments  where program_id = any(test_programs) or course_id = any(test_courses);
  delete from lms_attendance          where student_id = any(test_students);
  delete from lms_sessions            where course_id = any(test_courses);
  delete from lms_certificates        where student_id = any(test_students);
  delete from lms_exam_sessions       where student_id = any(test_students);
  delete from lms_module_attempts     where student_id = any(test_students);
  delete from lms_package_progress    where student_id = any(test_students);
  delete from lms_progress            where student_id = any(test_students);
  delete from lms_report_assessments  where student_id = any(test_students);
  delete from lms_feedback            where student_id = any(test_students);
  delete from lms_program_feedback    where student_id = any(test_students);
  delete from lms_enrollments         where student_id = any(test_students);
  delete from lms_program_members     where program_id = any(test_programs);
  delete from lms_programs            where id = any(test_programs);
  delete from lms_student_sessions    where student_id = any(test_students);
  delete from lms_email_log           where student_id = any(test_students) or to_email like '%@icsaviation.test';
  delete from lms_students            where id = any(test_students);
  delete from lms_companies           where code = 'ZZTEST';
  delete from lms_package_items       where package_id in (select id from lms_packages where course_id = any(test_courses));
  delete from lms_packages            where course_id = any(test_courses);
  delete from lms_modules             where course_id = any(test_courses);
  delete from lms_courses             where id = any(test_courses);
  delete from audit_logs              where actor_id = any(test_admin) or actor_name = 'PM Test Admin Temp';
  delete from viewer_access           where user_id = any(test_admin);
  delete from admin_users             where id = any(test_admin);
  delete from rate_limits             where key in ('lms-login:::1', 'lms-login:::ffff:127.0.0.1', 'login:::1', 'login:::ffff:127.0.0.1');
end $$;
select (select count(*) from lms_students where email like '%.temp@icsaviation.test') test_students,
       (select count(*) from lms_courses where title like 'ZZ TEST%') test_courses,
       (select count(*) from lms_programs where name like 'ZZ TEST%') test_programs,
       (select count(*) from admin_users where email like '%.temp@icsaviation.test') test_admins,
       (select count(*) from lms_enrollments) enrollments_total,
       (select count(*) from lms_certificates) certificates_total;
