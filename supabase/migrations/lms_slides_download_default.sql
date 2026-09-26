-- Slides are view-only unless an admin allows downloading (onsite packages are
-- created with it on). Online packages had inherited "on" from the column
-- default; they go back to view-only.
alter table lms_packages alter column slides_downloadable set default false;
update lms_packages p set slides_downloadable = false
  from lms_courses c where c.id = p.course_id and c.delivery_mode = 'online' and p.slides_downloadable = true;
