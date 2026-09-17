-- Deploy day — run BEFORE and AFTER 02_swap.sql. Both results must be identical:
-- the swap changes rules only, never rows. (Counts only; reads no student data.)
select 'lms_enrollments'            as table_name, count(*) as rows from lms_enrollments
union all select 'lms_package_progress',       count(*) from lms_package_progress
union all select 'lms_module_attempts',        count(*) from lms_module_attempts
union all select 'lms_exam_sessions',          count(*) from lms_exam_sessions
union all select 'lms_progress',               count(*) from lms_progress
union all select 'lms_assignment_submissions', count(*) from lms_assignment_submissions
union all select 'lms_feedback',               count(*) from lms_feedback
union all select 'lms_report_assessments',     count(*) from lms_report_assessments
union all select 'lms_certificates',           count(*) from lms_certificates
union all select 'lms_attendance',             count(*) from lms_attendance
order by 1;
