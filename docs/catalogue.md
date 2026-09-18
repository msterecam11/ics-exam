# Catalogue (CV-1 … CV-8, SP-14 … SP-16)

Students can browse courses and ask to join them; admins decide where they go.

---

## Categories

Courses are filed under **categories**, which are managed from Courses →
**Categories**: create, rename, recolour, reorder, archive. The order there is
the order students see.

- One category per course. A course with none sits under *Uncategorised*
  (students see it as *Other courses*).
- A category that still holds courses can't be deleted — archive it instead, so
  nothing silently loses its category.
- `lms_courses.category` (the old free-text field) is still written alongside
  `category_id`, so the code deployed before Step 10 keeps working.

Both the admin **Courses** screen and the student **Catalogue** open on the
categories, then show the courses inside with an **Onsite / Online / Hybrid**
filter. Search from the top level looks across every category.

## Who sees a course

| # | | |
|---|---|---|
| CV-1 | **Per course** (Course → Settings → Catalogue) | Hidden · All students · Individual learners only · Company participants only · Specific companies. **Default: hidden** — nothing appears until someone puts it there. |
| CV-2 | **Per company** (Company → edit → "Show course catalogue") | Off means that company's people see **nothing**, whatever any course says. The company switch always wins. |
| | Drafts | Only published courses ever appear. |
| CV-8 | Logged-in students only | No public catalogue or self sign-up until payments. |

A category appears to a student only when it holds at least one course that
student may see, so empty or fully-hidden categories never show.

## The card and the details page

| # | |
|---|---|
| CV-4 | Image, title, blurb (falls back to the description), category, delivery mode, level, duration. Price comes later, with payments. |
| SP-15 | Details: blurb, what they'll learn, description, **module titles only** — never the content itself. |
| CV-5 | Already on the course → "Enrolled", with no Request button. |

## Asking and answering

| # | |
|---|---|
| CV-6 | One pending request per course per student, with an optional note. After a rejection they may ask again. They can withdraw a request that hasn't been answered. |
| SP-16 | *My requests*: waiting, approved, not approved (with the reason), withdrawn. |
| CV-7 | Program Manager → **Requests** (admins only). **Approve** into a program that already delivers the course — the student's own client's programs (or individual programs, for an individual) are starred — or into **a new program made on the spot**: one course, their client, starting today. **Reject** needs a reason, which the student sees. |

Approving reuses the same path as adding someone in Program Manager, so the
student gets their enrolment, deadline, emails and reports like any other
member.

## Emails

| | |
|---|---|
| EM-11 | Confirmation to the student when they ask; also used to tell them when a request is turned down |
| EM-14 | To every admin, as a request comes in |
| | Approval is announced by the normal enrolment email |

All three follow the switches in LMS Settings → Emails.

## Not included

Learning paths in the catalogue (CV-3) — programs replaced them. Prices,
payments, public browsing and self sign-up come together in a later step.
