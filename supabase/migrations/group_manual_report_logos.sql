-- Optional client-branding logos shown on the manual (client) report,
-- alongside the ICS Aviation logo. Lives on groups (the client/organization
-- entity) rather than per-exam or per-candidate, since manual reporting is
-- planned to extend to Course- and Group-level reports too — a single
-- source of truth here means all of them pick up the same branding
-- automatically. Purely additive: defaults to an empty array, so every
-- existing group is unaffected and falls back to showing only the ICS logo.
ALTER TABLE groups ADD COLUMN manual_report_logos JSONB NOT NULL DEFAULT '[]'::jsonb;
