# pm-agent — working rules

## Branch and PR

Never commit or push to `main`. Branch from `main`, push the branch, open a PR.
`main` is protected on GitHub and will reject a direct push.

Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`. The `agent/<task-key>-<slug>`
prefix is reserved for branches the implementation agent creates.

## Every PR updates the docs

Before opening or updating a PR, review `docs/` and bring it in line with the code:

- **`docs/TASKS.md`** — tick the checkboxes for work completed, update the Status
  column (✅ done · 🟡 partial · ⬜ not started) and the legend date, and refresh
  the status note under each task touched so a partial task says what is blocking it.
- **`docs/HLD.md` / `docs/LLD.md`** — if the implementation diverged from the
  design, change the design doc in the same PR. A doc that contradicts the code
  is worse than no doc. Record *why* it diverged.
- **Decisions** — if the PR settles one of the open decisions at the top of
  `docs/TASKS.md`, tick it and record what was decided.

A `PreToolUse` hook in `.claude/settings.json` checks this before `git push` and
warns when a branch changes files without touching `docs/TASKS.md`. It is a
reminder, not a gate: if a branch genuinely needs no docs change, say so
explicitly in the PR description rather than skipping silently.

## Verify, don't assume

Claims about state belong in a PR only once checked. Run the migration, query the
table, hit the endpoint. When reporting status, check the current value rather
than recalling it from earlier in the session.

Guard triggers and RLS are the things the HLD says must never be wrong — exercise
both the allowed and the denied path before claiming either works.

## Commands

`pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm build` — all four run in CI.
`pnpm db:reset` applies migrations; a bare `supabase stop && start` restores from
backup and silently leaves the old schema in place.
