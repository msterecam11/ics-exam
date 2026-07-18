-- Widens report_cache.type (additive) so Manual Group/Course reports can
-- cache their AI narrative separately from the real one, keyed by the same
-- reference_id (groupId/courseId) but a distinct type.
ALTER TABLE report_cache DROP CONSTRAINT report_cache_type_check;
ALTER TABLE report_cache ADD CONSTRAINT report_cache_type_check
  CHECK (type = ANY (ARRAY['candidate','course','group','candidate_manual','course_manual','group_manual']));
