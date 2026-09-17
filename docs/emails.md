# LMS Emails (EM-1 … EM-20)

Every automatic email the LMS sends, and how it is controlled.

**Rule of the system: nothing is hard-coded.** Every email can be switched on or
off globally (LMS Settings → Emails) *and* per program (Program → Settings →
Emails), and every timing number is editable in the same place. A program either
follows the global setting ("Inherit") or overrides it.

---

## Student emails

| # | Code | Email | When it is sent | Timing knobs |
|---|------|-------|-----------------|--------------|
| EM-1 | `welcome` | Welcome + login details | The account is created or its password is reset | — |
| EM-2 | `program_started` | Program started | On the program's start date | — |
| EM-3 | `not_started` | Not started yet | N days after the program starts, if the student has opened nothing | `days` (3) |
| EM-4 | `inactive` | Inactive | No activity for N days while the program is running | `days` (7), `repeat_days` (7) |
| EM-5 | `deadline` | Deadline approaching | N days before **their own** end date (personal extensions respected) | `days_list` (14, 3) |
| EM-6 | `course_completed` | Course completed | The student completes a course | — |
| EM-7 | `certificate` | Certificate released | A certificate is released to the student | — |
| EM-8 | `last_attempt` | Last exam attempt left | They fail an exam with exactly one attempt remaining | — |
| EM-9 | `feedback_reminder` | Feedback reminder | N days after feedback was asked and still not given (FB-9) | `days` (3), once only |
| EM-10 | `class_reminder` | Class reminder | N hours before a live session | `hours` (24) |
| EM-11 | `catalogue_ack` | Catalogue request received | Confirmation to whoever asked (Step 10) | — |
| EM-12 | `password_reset` | Password reset | The student asks to reset their password | `expiry_minutes` (60) |

## Staff emails

| # | Code | Email | When it is sent | Timing knobs |
|---|------|-------|-----------------|--------------|
| EM-13 | `instructor_digest` | Weekly program digest | Weekly, to the program's instructors: new completions, who is behind, what needs grading | `weekday` (Mon) |
| EM-14 | `catalogue_admin` | Catalogue request received | To admins, as it happens (Step 10) | — |
| EM-15 | `grading_due` | Assignment to grade | A student submits an assignment | — |

---

## Controls

| # | Control | Where |
|---|---------|-------|
| EM-16 | **Per-program switches** — on / off / inherit for every email above, plus that program's own timing numbers | Program → Settings → Emails |
| | **Global switches** — the default every program inherits, and the only setting for the three emails that aren't tied to a program (welcome, password reset, catalogue) | LMS Settings → Emails |
| EM-17 | **Wording** — one branded template per email, English, filled in automatically (student, course, program, dates, link) | Built in |
| EM-18 | **Limits** — at most `daily_cap` (default 1) reminder per student per day; reminders stop once the thing they are about is done | LMS Settings → Emails |
| EM-19 | **Email log** — every email sent, skipped or failed, with the reason, filterable by student, program, type and status | LMS Settings → Emails |
| EM-20 | **Scheduled job** — one daily Render Cron Job hits `/api/cron/lms-daily`, which runs every date-driven check in one pass | Render dashboard (manual, once) |

### Master switch and test mode

- **Master switch** — one global pause. Off means nothing automatic leaves the
  system, whatever any program says. Emails a person triggers by hand (a manual
  resend) still work.
- **Test mode** — every email is redirected to one address instead of the real
  recipient, and the log records who it *would* have gone to. Used while
  building and safe to leave on. Default: **on**.
- **Dry run** — `/api/cron/lms-daily?dry=1` reports exactly who would receive
  what, and why everyone else was skipped, without sending or logging anything.

### Defaults for a new program

EM-2 … EM-10 on, EM-13 and EM-15 on. A program can turn any of them off without
affecting other programs.

---

## Notes

- **Priority:** master switch → program override → global default. The first one
  that says "off" wins.
- A reminder is never sent for a draft, completed or archived program.
- Reminders respect each student's own end date, including personal extensions.
- Students with no e-mail address on file are skipped and logged as such.
