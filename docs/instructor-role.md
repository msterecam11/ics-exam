# Instructor role (IR-1 … IR-15)

An instructor is staff, but not an administrator. They see the programs they are
assigned to and the students and courses inside them — nothing else.

**Where access is decided:** `src/lib/staff-access.ts`. Every route and page
guard goes through it. `src/lib/staff-roles.ts` holds the parts that must also
work in the browser (the permission list, the sidebar rules).

---

## What every instructor gets

| # | | |
|---|---|---|
| IR-1 | **Their programs** | Only the programs listed under Program → Settings → Instructors, and only the students and courses inside them. Anything else answers *not found* rather than *forbidden*, so the reply can't be used to discover what the LMS holds. |
| IR-2 | **Tracks** | Optionally limited to particular tracks of a program. Nothing ticked means the whole program. |
| IR-3 | **Sidebar** | Dashboard, Program Manager, Live Sessions, Reports. Courses, Question Bank and Library appear with *Author courses*; Students appears with *Manage students*. Nobody is offered a screen that would then refuse them. |
| IR-4 | **Their programs' detail** | Structure, students, progress. |
| IR-5 | **Reports** | Every level for their own programs (RL-1 … RL-6). A course report must name one of their programs; "every run across programs" (RL-8) and whole-client reports stay with admins. |
| IR-6 | **Grading** | Mark assignments and review AI marks, for their own students. |
| IR-7 | **Classes** | Create, edit and close sessions, and take attendance, for their programs and tracks. |
| IR-8 | **AI summary** | Generate the expert report for their own students and programs. |

## Extra permissions, ticked per account

LMS Settings → User Management → the instructor's account.

| # | Permission | What it adds |
|---|---|---|
| IR-9 | Release certificates | Release held certificates for their students |
| IR-10 | Manage students | Add and edit students, and add them to a program they teach |
| IR-11 | Export reports | Download report PDFs and Excel files. Without it reports are still readable on screen |
| IR-12 | Author courses | Create and edit courses, packages, exams, question banks and the course generator. **Publishing and deleting stay with admins** |
| IR-13 | Pass mark & attempts | Set a program's own pass mark and attempt limit, on their programs |
| IR-14 | Reset attempts | Give one of their students another go |

The extras are cleared automatically if the account stops being an instructor.

## Admin only, always (IR-15)

Creating, deleting, duplicating a program or changing its status · companies ·
staff accounts and roles · assigning instructors · LMS settings including the
email settings and student passwords · the bulk import · deleting students or
courses · publishing a course · moving a student between programs ·
whole-client reports.

---

## Notes

- **Deny by default.** `isMgr(role)` means *admin*. A route nobody has
  deliberately opened stays closed. Before Step 9 it meant `admin || instructor`
  in about seventy files, which gave an instructor the run of the whole LMS.
- **An instructor with no programs** is told exactly that, rather than being
  shown everything or a bare 403.
- `admin_users.role` defaults to `instructor` in the database, so an account
  created without an explicit role becomes one. That is safe now the role is
  scoped, but it is why the lockdown mattered.
- Not yet covered: IR-16 (viewers — built separately in Step 7/RL-9),
  IR-17 (audit of every instructor action) and IR-18, which were deferred.
