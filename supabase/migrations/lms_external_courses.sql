-- External courses: a course another body owns (e.g. ICAO) that we deliver as
-- a third party. The LMS holds only its general information; the result is
-- entered by hand per participant, the provider's certificate is uploaded, and
-- the program decides whether our own certificate is issued too.
-- Additive only.
alter type lms_delivery_mode add value if not exists 'external';
alter table lms_enrollments add column if not exists manual_result jsonb;
alter table lms_programs add column if not exists external_ics_certificate boolean not null default false;
