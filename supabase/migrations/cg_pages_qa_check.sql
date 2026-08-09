-- Visual QA verdict, kept on the slide alongside fact_check.
--
-- Same reasoning as fact_check: "the reviewer could not run" is a real state
-- and must be distinguishable from "the reviewer approved it". Before this
-- column a QA failure was swallowed with a console line and the slide shipped
-- looking exactly like an approved one.
--
-- Shape: { checked, pass, scores: {composition,hierarchy,...}, issues[],
--          fix_layer, feedback }  — see src/lib/course-gen/jobs/qa.ts

alter table if exists public.cg_pages
  add column if not exists qa_check jsonb;
