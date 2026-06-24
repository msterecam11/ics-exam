-- Add overview_html for rich-text course overview (TipTap HTML content)
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS overview_html TEXT;
