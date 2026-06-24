-- Add resource_type: distinguishes scope within a system
-- exam system:      'exam' | 'course' | 'group'
-- interview system: 'group' | 'config'
ALTER TABLE viewer_access
  ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'exam',
  ADD COLUMN IF NOT EXISTS permissions   JSONB NOT NULL DEFAULT '{}';

-- Index for querying by system + resource type
CREATE INDEX IF NOT EXISTS idx_viewer_access_resource_type ON viewer_access(system, resource_type);

COMMENT ON COLUMN viewer_access.resource_type IS
  'Scope within the system: exam=exam|course|group, interview=group|config';

COMMENT ON COLUMN viewer_access.permissions IS
  'Exam: {scores,results,reports}. Interview: {progress,scores,verdicts,reports}. All boolean.';
