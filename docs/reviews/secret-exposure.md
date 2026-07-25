# Secret Exposure Review

Date: 26 July 2026  
Branch: `governance/ci-hardening`

## Result

The repository-root `.env` and `backend/.env` exist locally and are ignored. A
full-history search across all local branches found no commit containing `.env`,
`backend/.env`, or a nested `*/.env` file.

No repository-history secret rotation or history scrub is required from this
finding.

## Verification

The following checks were run without printing environment values:

```text
git log --all --full-history --oneline -- .env backend/.env "*/.env"
git check-ignore -v .env .env.local backend/.env
```

The history command returned no commits. The ignore check confirmed:

- `.env` is ignored;
- `.env.local` is ignored;
- `backend/.env` is covered by the repository-wide `.env` rule.

Gitleaks is added to CI as the preventive control for future commits.
