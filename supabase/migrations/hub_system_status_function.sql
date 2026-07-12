-- One-call system status for the /hub/status dashboard. SECURITY DEFINER so
-- it can read pg_database_size and storage.objects; only ever called through
-- the service-role client behind an admin-only page.
CREATE OR REPLACE FUNCTION public.hub_system_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'top_tables', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 8
      ) t
    ),
    'storage_buckets', (
      SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) FROM (
        SELECT bucket_id, count(*) AS files,
               COALESCE(sum((metadata->>'size')::bigint), 0) AS bytes
        FROM storage.objects
        GROUP BY bucket_id
        ORDER BY 3 DESC
      ) s
    ),
    'counts', jsonb_build_object(
      'exams',          (SELECT count(*) FROM exams),
      'candidates',     (SELECT count(*) FROM candidates),
      'question_banks', (SELECT count(*) FROM question_banks),
      'questions',      (SELECT count(*) FROM questions),
      'lms_students',   (SELECT count(*) FROM lms_students),
      'lms_courses',    (SELECT count(*) FROM lms_courses),
      'admin_users',    (SELECT count(*) FROM admin_users)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.hub_system_status() FROM anon, authenticated;
