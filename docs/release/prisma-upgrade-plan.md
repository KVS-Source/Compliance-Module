# Prisma upgrade proposal

Status: PLAN ONLY — implementation requires approval. Reviewed 2026-10-09.
No Prisma package, schema, migration or database was changed for this proposal.

## Decision required

Approve a separate compatibility spike for a supported stable Prisma release,
not an immediate production upgrade. Retain Prisma 6.19.3 in the current handoff
and keep its dependency finding visible until a verified fix is available.

Registry checks found Prisma 6.19.3 as the newest stable 6.x. Prisma 7.10.0 is
stable, but its config package also pins deepmerge-ts 7.1.5: moving to 7 alone
does **not** close GHSA-ggr8-5vv4-36mx. The `prisma` latest tag currently points
to 8.0.0-rc.22, whereas `@prisma/client` latest is 7.10.0. Never install these
unqualified tags as a matching pair or assume a major bump fixes this advisory.

Prisma 8 is a release candidate with a different runtime/migration model.
Upstream lists missing transaction-isolation, atomic-update and error-code
capabilities. This application relies on atomic sequence increments and P2002
conflict handling. It is not a drop-in replacement. A prerelease or unsupported
deepmerge-ts override is not proposed for delivery.

Sources: [release status](https://www.prisma.io/docs/orm/release-status),
[v7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7),
[PostgreSQL v7-to-v8 guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/postgresql),
[dependency advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
Versions and audit results must be rechecked when implementation is approved.

## Local compatibility inventory

- Authority: `backend/prisma/schema.prisma`; 55 models, 33 enums and 25 immutable
  migration directories. Preserve all names, enum values, relation mappings,
  indexes, triggers, constraints, RLS policies and migration checksums.
- 121 source, seed, script and test files reference the existing Prisma client
  or construct a client. Inventory these import and constructor sites before
  edits, including disposable-database tests and production initialization.
- `backend/src/config/prisma.ts` uses `datasourceUrl` and URL query parameters
  for connection, pool and connect timeouts. Equivalent driver settings must be
  demonstrated, including pool exhaustion, shutdown and readiness failures.
- Backend NodeNext configuration currently emits CommonJS because its package
  has no `type: module`. Review generated-client module format and compiled
  startup together; do not break the existing Node server entry point.
- Existing error translation, unique-conflict retries, serial counters,
  refresh-token races, approval locking and evidence gates are high-risk paths.
- Docker generation/build/prune stages, migration-only image, CI installs,
  reset-test-schema, catalogue verification and backup/restore tooling all
  depend on the current client/CLI contract.

## Proposed phases

1. **Version-selection gate.** Inspect candidate manifests and audited lockfile
   in a disposable directory. Select exact, stable compatible CLI/client/driver
   versions only. If no supported candidate clears the advisory, stop and report
   that fact; a successful v7 experiment is not security closure.
2. **Approved v7 compatibility spike if needed.** Follow upstream guidance for
   explicit generation output, environment loading and CLI configuration. Add
   the PostgreSQL driver adapter and deliberate pool settings. Review module
   format and client imports across application, scripts, seeds and tests.
   Generator/datasource changes need explicit approval; no business-model change
   or historical SQL rewrite is permitted.
3. **Regression gate.** Fresh locked installation; Prisma validation/generation;
   frontend/backend typecheck, lint and build; unit, all isolated PostgreSQL
   integration files, desktop/mobile browser and real-stack browser tests.
   Include tenant/RLS negatives, maker-checker, cookie rotation, approval races,
   evidence uniqueness, append-only history and automatic-risk uniqueness.
4. **Data-preservation gate.** Apply the unchanged migration chain to empty
   disposable PostgreSQL, reconcile catalogue, restore an approved synthetic
   backup to another disposable database, and compare all table counts and
   safeguards. Check `migrate status` against the restored copy. No reset or
   conversion against operational data.
5. **Image/security gate.** Build non-root runtime and migration images; verify
   compiled startup and health/readiness. Confirm development tooling is not
   unnecessarily shipped. Re-run full and production audits, Semgrep and
   Gitleaks. Update operating commands and generate a new checked source export.
6. **Human review.** Report exact changes, evidence, remaining findings and
   rollback procedure. Stop before commit publication, merge or deployment.

## Acceptance and rollback

Security closure requires an audited supported dependency tree, not merely a
renamed CLI or a documented workaround. Public API behavior and data must remain
equivalent; all existing database safeguard checks must pass. Any required new
migration or runtime architecture beyond v7 needs a separate reviewed proposal.

Preserve the current source/lockfiles and private verified backup before the
spike. Since the proposed compatibility spike must not change business schema,
rollback should restore the prior application image and dependency set without
reversing database changes. If this assumption stops being true, halt before
applying changes and obtain a reviewed data-migration/rollback plan.
