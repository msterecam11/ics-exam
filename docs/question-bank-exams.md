# Question-bank exams (Step 11)

Exams are built from the question bank, every student sits a frozen paper, and
a past result only ever changes on purpose.

---

## The rules

1. **Questions live only in the bank.** An exam is a list of **sections** that
   reference bank questions. Typing a question in the exam builder saves it
   into the bank behind the scenes.
2. **Every question has versions.** Every paper records the exact version,
   text, options, answer key, points, rubric, course module and topic it was
   given.
3. **Grading, reports and Recalculate read only the paper**, never the live
   question.
4. **Nothing on a paper is ever deleted.** Questions and sets are archived.
5. **Points are fixed per section**, so every paper of an exam totals the same.
6. **Every correction, void and certificate decision is logged**
   (`lms_bank_question_history`, `audit_logs`).

## Sections

| Kind | What it is |
|---|---|
| **Fixed** | These questions, in this order — how every exam worked before |
| **Draw** | *n* questions at random from a set, optionally of one difficulty, at a fixed number of points each. Must name the course module it tests. |

Fully fixed, fully drawn, or mixed. At **Begin Exam** the draw happens and the
paper is frozen. A draw never repeats a question on one paper, and on a retake
it prefers questions the student hasn't seen (in any program), falling back to
the ones seen longest ago.

An exam that can't build a paper — a draw asking for more questions than its
set holds, an archived question in a fixed section — **can't be published**,
and on a published course it **can't be saved** in that state.

## Editing a question

A question **nobody has answered yet** can be edited freely.

Once a student has had it on a paper, saving asks what the edit is:

| | Meaning | Who it reaches | Who may do it |
|---|---|---|---|
| **Correct** | It was a mistake | Everyone who had *that version* — finished attempts and exams in progress — after a preview | Admins |
| **Update** | A deliberate change | A new version; future papers only | Admins, and instructors with *Author courses* |
| **Void** | The question is broken | Removed from everyone's total; also taken out of the exams that hold it | Admins |

The system decides what is allowed from what changed:

| Change | Allowed |
|---|---|
| Wording only | Correct (marks can't move) or Update |
| Answer key, points, partial credit | Correct or Update |
| Question type; options, items or pairs added or removed | **Update only** — past answers can't be re-marked fairly |
| Open-ended rubric | Correct → affected answers go to review · or Update |

## Recalculate

Kept, admin-only, always previews first. It re-marks every paper of the exam
against the **current content of the version each student was given** — so it
applies corrections and can never apply an update.

**Finished programs** (completed or archived) are shown in the preview and left
alone unless explicitly included: their reports and certificates have already
gone to the client.

## After a correction — the review list

| | |
|---|---|
| **Certificate** | Someone who now fails but already holds a certificate. Never revoked automatically: keep it, or revoke with a reason. |
| **Re-mark** | An open-ended answer marked under a rubric that was corrected. Its mark stays until someone sets a new one; the AI can suggest a mark on request. |

## Moving existing exams into the bank

One click per exam (admin), or all at once on deploy day. It:

1. saves a paper for every past attempt and open exam that lacks one, from the
   questions they were marked on;
2. creates a set for the exam and one bank question per question, keeping each
   question's old id (answers and Expert Analyze results are keyed by it) and
   its module and topic from Expert Analyze;
3. makes the exam a single fixed section, in the same order.

Students see no difference. Until the redeploy, the exam's old inline question
list is kept equal to the bank, so the code already deployed keeps agreeing.

**Caveat:** a past attempt with no saved paper gets the exam's *current*
questions as its paper. If a key was changed before the move, the original is
not recoverable — no worse than before, when such attempts already read the
current questions.

## Not included

Practice activities and quizzes inside packages — they aren't exams.
