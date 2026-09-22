# pm-agent

A single-user, Jira-like board where you write tasks, a refinement agent turns
them into specs, you approve, and an implementation agent opens a pull request.

Design docs: [HLD](docs/HLD.md) · [LLD](docs/LLD.md) · task breakdown in [TASKS](docs/TASKS.md).

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node | 24.x LTS | 24.21.0 verified; older 22.x silently skips native optional deps (rolldown) |
| pnpm | 12+ | pinned by `packageManager` in the root package.json |
| Docker | running, Linux containers | local Supabase stack; implementation sandbox (M3) |
| Supabase CLI | pinned as a root devDependency | use `pnpm supabase`, not a global install |

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in — see LLD §11
pnpm db:start                # first run pulls several GB of images
pnpm dev                     # http://localhost:3000
```

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Next.js dev server on http://localhost:3000 |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` across every workspace package |
| `pnpm test` | Vitest across every workspace package |
| `pnpm lint` | ESLint |

### Database

| Command | Does |
| --- | --- |
| `pnpm db:start` / `pnpm db:stop` | Start / stop the local Supabase stack |
| `pnpm db:status` | Print local URLs and keys |
| `pnpm db:reset` | Drop and re-apply every migration, then seed |
| `pnpm db:test` | Run the pgTAP suite in `supabase/tests/` (assumes a clean database) |
| `pnpm db:verify` | Reset, then run the pgTAP suite — use this one |
| `pnpm db:types` | Regenerate `packages/db/src/database.types.ts` |
| `pnpm db:push` | Apply migrations to the linked hosted project |
| `pnpm db:diff` | Diff local schema against the migrations |

Local endpoints once `pnpm db:start` is running:

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | http://127.0.0.1:54323 |
| Mailpit (auth emails) | http://127.0.0.1:54324 |

The local anon and service-role keys are Supabase's well-known development
keys — identical on every machine, and not secrets. `.env.local` is pre-filled
with them.

## Layout

```text
apps/web               Next.js 16 (App Router) — UI, API routes, orchestrator host
packages/domain        Pure types, state machine, Zod schemas (nothing but zod)
packages/db            Generated Supabase types + typed query helpers
packages/github        GitHub App auth, Octokit wrappers
packages/sandbox       Docker container lifecycle
packages/agents        AgentRunner, refinement + implementation agents, prompts
packages/orchestrator  Worker loops, job handlers, budgets, locks
supabase/              Migrations, pgTAP tests, Edge Functions
```

Dependency rules between packages are in LLD §2 and are deliberately one-way —
`domain` depends on nothing, `agents` never touches the database.

## Migrations

A migration reaches the hosted Supabase project only after `pnpm db:reset` and
`pnpm db:test` pass locally. Never edit the hosted schema in Studio.
