-- 0001_init — enums, tables, indexes, Storage and Realtime (LLD §3, T-101).
--
-- Shape of the schema: `tasks` holds only current state plus pointers, while
-- specs, runs and events are append-only so history is never lost. Triggers,
-- RLS and the state machine arrive in T-102/T-103; this migration is structure
-- only.

-- pgmq is not used until M2, but enabling it here keeps the migration stable
-- so later migrations never have to reorder extension setup.
create extension if not exists pgmq;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type task_state as enum (
  'draft','refining','awaiting_approval','ready_to_pull',
  'in_progress','blocked','in_review','done','cancelled');

create type run_kind   as enum ('refine','implement','address_review');

create type run_status as enum ('queued','running','succeeded','failed','cancelled');

create type actor_kind as enum ('user','agent','github','system');

-- ---------------------------------------------------------------------------
-- projects — one per repository
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  key_prefix text not null check (key_prefix ~ '^[A-Z]{2,6}$'),
  repo_owner text not null,
  repo_name text not null,
  default_branch text not null default 'main',
  github_installation_id bigint,                  -- null until the App is installed
  setup_commands text[] not null default '{}',    -- e.g. {'pnpm i'}
  test_commands  text[] not null default '{}',    -- e.g. {'pnpm test','pnpm lint'}
  next_task_number int not null default 1,
  created_at timestamptz not null default now(),
  unique (owner_id, key_prefix)
);

-- ---------------------------------------------------------------------------
-- tasks — current state and pointers only
-- ---------------------------------------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  key text not null unique,                       -- 'PM-42'
  title text not null,
  description text not null default '',
  state task_state not null default 'draft',
  priority smallint not null default 2 check (priority between 0 and 3),
  labels text[] not null default '{}',
  position double precision not null default 0,   -- order within column
  current_spec_id uuid,
  approved_spec_id uuid,
  branch text,
  pr_number int,
  pr_url text,
  locked_by text,                                 -- worker id
  locked_at timestamptz,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on tasks (project_id, state, position);

-- One task per PR: stops two tasks claiming the same pull request, which would
-- make webhook-to-task mapping ambiguous (LLD §9).
create unique index on tasks (project_id, pr_number) where pr_number is not null;

-- ---------------------------------------------------------------------------
-- task_specs — immutable; a new version on every refinement
-- ---------------------------------------------------------------------------

create table task_specs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  version int not null,
  content jsonb not null,            -- validated RefinementOutput
  created_by_run_id uuid,
  created_at timestamptz not null default now(),
  unique (task_id, version)
);

-- Declared after task_specs because the two tables reference each other.
alter table tasks
  add foreign key (current_spec_id)  references task_specs(id),
  add foreign key (approved_spec_id) references task_specs(id);

-- ---------------------------------------------------------------------------
-- comments — your feedback on specs, and agent questions
-- ---------------------------------------------------------------------------

create table comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  spec_id uuid references task_specs(id),
  author actor_kind not null,
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index on comments (task_id, created_at);

-- ---------------------------------------------------------------------------
-- agent_runs — one row per attempt
-- ---------------------------------------------------------------------------

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind run_kind not null,
  status run_status not null default 'queued',
  attempt int not null default 1,
  spec_id uuid references task_specs(id),
  prompt_version text not null,
  model text not null,
  input_snapshot jsonb not null,
  output jsonb,
  summary text,
  ci_conclusion text,                -- from check_suite webhooks
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  transcript_path text,              -- Supabase Storage object name
  container_id text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index on agent_runs (task_id, created_at desc);
create index on agent_runs (created_at) where status = 'succeeded';

-- task_specs.created_by_run_id is declared here, once agent_runs exists.
alter table task_specs
  add foreign key (created_by_run_id) references agent_runs(id);

-- ---------------------------------------------------------------------------
-- run_logs — streamed to the UI over Realtime
-- ---------------------------------------------------------------------------

create table run_logs (
  id bigint generated always as identity primary key,
  run_id uuid not null references agent_runs(id) on delete cascade,
  seq int not null,
  level text not null check (level in ('debug','info','warn','error')),
  kind text not null,                -- 'text' | 'tool_call' | 'tool_result' | 'status'
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

-- ---------------------------------------------------------------------------
-- task_events — audit trail, one row per transition
-- ---------------------------------------------------------------------------

create table task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  from_state task_state,
  to_state task_state not null,
  actor actor_kind not null,
  reason text,
  created_at timestamptz not null default now()
);

create index on task_events (task_id, created_at);

-- ---------------------------------------------------------------------------
-- github_events — idempotent webhook ingestion
-- ---------------------------------------------------------------------------

create table github_events (
  delivery_id text primary key,       -- X-GitHub-Delivery
  event text not null,
  action text,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- settings — per-user tunables, editable from the UI
-- ---------------------------------------------------------------------------

create table settings (
  owner_id uuid primary key references auth.users(id),
  daily_budget_usd numeric(10,2) not null default 10,
  max_concurrent_impl int not null default 1,
  refine_model text not null,
  implement_model text not null
);

-- ---------------------------------------------------------------------------
-- task_transitions — the state machine, as data (seeded in T-103)
-- ---------------------------------------------------------------------------

create table task_transitions (
  from_state task_state not null,
  to_state   task_state not null,
  actors     actor_kind[] not null,
  primary key (from_state, to_state)
);

-- ---------------------------------------------------------------------------
-- Storage — private bucket for run artefacts
-- ---------------------------------------------------------------------------

-- Object names are '<run_id>/transcript.jsonl', '<run_id>/diff.patch' and
-- '<run_id>/test-output.txt'. Access policies are added in T-102.
insert into storage.buckets (id, name, public)
values ('runs', 'runs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Realtime — the tables the board and run viewer subscribe to
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table task_specs;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table agent_runs;
alter publication supabase_realtime add table run_logs;
