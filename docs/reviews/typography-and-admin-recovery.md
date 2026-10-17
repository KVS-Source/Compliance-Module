# Typography and administrator password recovery

Verification date: 16 October 2026.

## Changes

- The interface uses locally served IBM Plex Sans. Record codes use IBM Plex
  Mono. Both families include regular, medium and semibold faces, with the
  original SIL Open Font License and pinned upstream provenance retained under
  `frontend/src/assets/fonts/ibm-plex/`.
- Active typography overrides the retained prototype stylesheet without editing
  that reference. Body text is 14px with 1.5 line spacing; headings use semibold
  weight and table numbers use tabular figures. PDF exports retain their own
  embedded report font.
- Setting a password through Users revokes that identity's unrevoked refresh
  tokens across all Companies. Password update, revocation and the existing
  USER_UPDATE audit event share one transaction. The audit records the number
  of revoked refresh-token rows without recording credential material.
- Profile edits that omit the password leave refresh sessions intact. Existing
  user-write permission and active Company membership checks remain in place.
- The edit form explains the sign-in effect. Operations guidance now covers
  forgotten email, another administrator's reset, operator account provisioning
  when no administrator can sign in, and individually assigned backup admins.

## Recovery boundaries

Existing access tokens remain valid until their normal short expiry. Refresh
revocation prevents subsequent renewal; it does not immediately invalidate an
already-issued bearer token. The Sessions panel's separate manual actions remain
Company-scoped. Password changes affect the global identity across Companies.

No reset-email service or new operator tool was introduced. The documented
initializer remains an operator procedure using approved provisioning privileges
and a unique account identity in the intended existing Company. Recovering an
account never requires resetting or reseeding the application database.

## Verification

- `npm run verify:static`: backend and frontend typechecks, lints, builds and all
  four architecture/route guards passed. The existing frontend chunk-size warning
  remains.
- `npm run test:unit`: 378 passed across 28 files.
- `npm run test:integration`: 402 passed across all 44 files, each prepared with a
  fresh migrated and seeded fixture on a task-owned disposable PostgreSQL instance.
- Prisma validation and generation passed during disposable setup. No schema or
  migration was changed.
- Four new integration cases cover password reset across Companies, unaffected
  profile edits, unauthorized/cross-Company refusal, and rollback of the password
  and revocation when another part of the same update fails. Old passwords and
  refresh cookies are refused after reset; the new password authenticates and
  unrelated users' refresh tokens remain unchanged.
- The first integration run caught two test setup mistakes: the Company switch
  omitted its refresh cookie, and the rollback test assumed a specific Prisma
  error code. The setup and error expectation were corrected while preserving
  the persisted-state and rollback assertions. The complete subsequent run passed.
- Manual checks in the in-app browser covered login, dashboard, Users, the edit
  form and Reports at desktop and phone widths, including a 1280px desktop and
  390px phone viewport. Font-family styles, semibold headings, tabular table
  numerals, accessible reset guidance and absence of page-level horizontal
  overflow were checked. Temporary viewport overrides were reset afterwards.
- The automated Playwright suite was not rerun. Browser verification above is a
  manual responsive check, separate from the real PostgreSQL integration tests.

Existing workspace edits were preserved. No operational password, persistent
database, environment file or deployment was changed. No commit or push was made.
