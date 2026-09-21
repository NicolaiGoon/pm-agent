-- 0002_triggers_and_rls — trigger guards, RLS and Storage policies
-- (LLD §3, T-102).
--
-- Two layers of protection. Triggers enforce invariants that must hold no
-- matter who is writing, including the service role: state changes may only
-- happen inside transition_task, and an approved spec can never be replaced.
-- RLS then restricts every user-facing row to its owner.

-- ---------------------------------------------------------------------------
-- tasks_updated_at
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks_guard_state
-- ---------------------------------------------------------------------------

-- The state machine is only valid if every transition goes through
-- transition_task (T-103), which sets app.transition = 'on' for the duration
-- of its update. Anything else touching these columns is a bug or an attack,
-- including a direct write with the service role key.
create or replace function guard_task_state()
returns trigger language plpgsql as $$
declare
  guarded text[] := '{}';
begin
  if coalesce(current_setting('app.transition', true), 'off') = 'on' then
    return new;
  end if;

  -- array_append, not ||: an untyped literal on the right of || is parsed as
  -- an array literal, which fails at runtime rather than at create time.
  if new.state            is distinct from old.state            then guarded := array_append(guarded, 'state'); end if;
  if new.approved_spec_id is distinct from old.approved_spec_id then guarded := array_append(guarded, 'approved_spec_id'); end if;
  if new.locked_by        is distinct from old.locked_by        then guarded := array_append(guarded, 'locked_by'); end if;
  if new.locked_at        is distinct from old.locked_at        then guarded := array_append(guarded, 'locked_at'); end if;
  if new.pr_number        is distinct from old.pr_number        then guarded := array_append(guarded, 'pr_number'); end if;

  if array_length(guarded, 1) > 0 then
    raise exception
      'column(s) % may only be changed through transition_task()',
      array_to_string(guarded, ', ')
      using errcode = 'P0003';
  end if;

  return new;
end $$;

create trigger tasks_guard_state
  before update on tasks
  for each row execute function guard_task_state();

-- ---------------------------------------------------------------------------
-- task_specs_guard_approved
-- ---------------------------------------------------------------------------

-- Approval pins a specific spec version (LLD §4). If a new version could
-- appear after approval, the implementation agent could build something you
-- never agreed to. task_state is an enum declared in lifecycle order, so
-- '>= ready_to_pull' covers ready_to_pull, in_progress, blocked, in_review,
-- done and cancelled, while leaving draft, refining and awaiting_approval
-- open. Getting a fresh spec after that point means moving the task back to
-- refining first, which is exactly the intended route.
create or replace function guard_spec_insert()
returns trigger language plpgsql as $$
declare
  s task_state;
begin
  select state into s from tasks where id = new.task_id;
  if s is null then
    raise exception 'task % not found', new.task_id;
  end if;
  if s >= 'ready_to_pull' then
    raise exception
      'cannot add a spec version while the task is in state %', s
      using errcode = 'P0004';
  end if;
  return new;
end $$;

create trigger task_specs_guard_approved
  before insert on task_specs
  for each row execute function guard_spec_insert();

-- ---------------------------------------------------------------------------
-- on_auth_user_created
-- ---------------------------------------------------------------------------

-- Every user needs a settings row before the orchestrator can read a budget
-- or model. Defaults follow the HLD: a cheaper model for refinement, a
-- stronger one for implementation. T-502 revisits both from eval data, and
-- they are editable from the settings page meanwhile.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into settings (owner_id, daily_budget_usd, max_concurrent_impl,
                        refine_model, implement_model)
  values (new.id, 10, 1, 'claude-sonnet-5', 'claude-opus-5')
  on conflict (owner_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table projects          enable row level security;
alter table tasks             enable row level security;
alter table task_specs        enable row level security;
alter table comments          enable row level security;
alter table agent_runs        enable row level security;
alter table run_logs          enable row level security;
alter table task_events       enable row level security;
alter table github_events     enable row level security;
alter table settings          enable row level security;
alter table task_transitions  enable row level security;

-- projects — full control for the owner.
create policy projects_select on projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy projects_insert on projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy projects_update on projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy projects_delete on projects for delete to authenticated
  using (owner_id = (select auth.uid()));

-- tasks — a task may only be created in 'draft'; everything after that is the
-- state machine's business. Updates are further narrowed by tasks_guard_state.
create policy tasks_select on tasks for select to authenticated
  using (owner_id = (select auth.uid()));
create policy tasks_insert on tasks for insert to authenticated
  with check (owner_id = (select auth.uid()) and state = 'draft');
create policy tasks_update on tasks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy tasks_delete on tasks for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Child tables — readable through the owning task. They are written only by
-- the orchestrator and the agents, which use the service role and bypass RLS.
create policy task_specs_select on task_specs for select to authenticated
  using (exists (select 1 from tasks t
                 where t.id = task_specs.task_id
                   and t.owner_id = (select auth.uid())));

create policy comments_select on comments for select to authenticated
  using (exists (select 1 from tasks t
                 where t.id = comments.task_id
                   and t.owner_id = (select auth.uid())));

-- You may add your own comments; agent, github and system comments are
-- inserted server-side.
create policy comments_insert on comments for insert to authenticated
  with check (author = 'user'
              and exists (select 1 from tasks t
                          where t.id = comments.task_id
                            and t.owner_id = (select auth.uid())));

-- Marking a comment resolved is a user action (T-208).
create policy comments_update on comments for update to authenticated
  using (exists (select 1 from tasks t
                 where t.id = comments.task_id
                   and t.owner_id = (select auth.uid())))
  with check (exists (select 1 from tasks t
                      where t.id = comments.task_id
                        and t.owner_id = (select auth.uid())));

create policy agent_runs_select on agent_runs for select to authenticated
  using (exists (select 1 from tasks t
                 where t.id = agent_runs.task_id
                   and t.owner_id = (select auth.uid())));

-- run_logs reaches tasks through agent_runs.
create policy run_logs_select on run_logs for select to authenticated
  using (exists (select 1
                 from agent_runs r
                 join tasks t on t.id = r.task_id
                 where r.id = run_logs.run_id
                   and t.owner_id = (select auth.uid())));

create policy task_events_select on task_events for select to authenticated
  using (exists (select 1 from tasks t
                 where t.id = task_events.task_id
                   and t.owner_id = (select auth.uid())));

-- settings — the row is created by the trigger; you may read and edit it.
create policy settings_select on settings for select to authenticated
  using (owner_id = (select auth.uid()));
create policy settings_update on settings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- github_events and task_transitions deliberately have no policies. RLS is
-- enabled and nothing is granted, so authenticated users cannot touch them at
-- all; only the Edge Function and orchestrator do, via the service role.

-- ---------------------------------------------------------------------------
-- Storage policies for the private `runs` bucket
-- ---------------------------------------------------------------------------

-- Object names are '<run_id>/<file>', so the first path segment identifies the
-- run. Readable only when that run belongs to one of your own tasks.
create policy runs_select on storage.objects for select to authenticated
  using (
    bucket_id = 'runs'
    and exists (
      select 1
      from agent_runs r
      join tasks t on t.id = r.task_id
      where r.id::text = (storage.foldername(name))[1]
        and t.owner_id = (select auth.uid())
    )
  );

-- No insert, update or delete policies: only the orchestrator writes run
-- artifacts, and it uses the service role.
