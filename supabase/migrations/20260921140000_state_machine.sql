-- 0003_state_machine — task_transitions seed, transition_task, create_task
-- (LLD §4, T-103).
--
-- Every state change goes through transition_task(). It validates the move,
-- applies a whitelisted patch, writes the audit row and enqueues the follow-up
-- job in one transaction. The tasks_guard_state trigger (T-102) blocks any
-- other route, so this function is the state machine's only door.

-- ---------------------------------------------------------------------------
-- The transition table, as data
-- ---------------------------------------------------------------------------

-- 14 concrete rows. Cancellation is a wildcard — any state except done and
-- cancelled, by the user — and is handled as a special case inside
-- transition_task rather than enumerated here. packages/domain/src/states.ts
-- mirrors these rows, and a Vitest parity test compares the two.
insert into task_transitions (from_state, to_state, actors) values
  ('draft',             'refining',          '{user}'),
  ('refining',          'awaiting_approval', '{agent}'),
  ('refining',          'blocked',           '{agent}'),
  ('awaiting_approval', 'refining',          '{user}'),
  ('awaiting_approval', 'ready_to_pull',     '{user}'),
  ('ready_to_pull',     'in_progress',       '{agent}'),
  ('in_progress',       'in_review',         '{github,agent}'),
  ('in_progress',       'blocked',           '{agent}'),
  ('in_progress',       'ready_to_pull',     '{system}'),
  ('blocked',           'ready_to_pull',     '{user}'),
  ('blocked',           'refining',          '{user}'),
  ('in_review',         'in_progress',       '{github}'),
  ('in_review',         'done',              '{github}'),
  ('in_review',         'blocked',           '{github}')
on conflict (from_state, to_state) do update set actors = excluded.actors;

-- ---------------------------------------------------------------------------
-- enqueue_for_state — stub
-- ---------------------------------------------------------------------------

-- T-201 replaces this with the pgmq sends. Declared now so transition_task can
-- call it, which keeps the state change and its job in one transaction from the
-- start rather than bolting that on later.
create or replace function enqueue_for_state(t tasks, p_from task_state, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- no-op until T-201
  return;
end $$;

-- ---------------------------------------------------------------------------
-- transition_task
-- ---------------------------------------------------------------------------

create or replace function transition_task(
  p_task_id uuid,
  p_to task_state,
  p_actor actor_kind,
  p_reason text default null,
  p_patch jsonb default '{}'::jsonb   -- whitelisted keys: branch, pr_number,
                                      -- pr_url, current_spec_id, locked_by,
                                      -- expected_spec_id, review_id
) returns tasks
language plpgsql security definer set search_path = public as $$
declare
  t tasks;
  allowed boolean;
  v_from task_state;
begin
  -- Row lock: two workers must not claim the same task.
  select * into t from tasks where id = p_task_id for update;
  if not found then
    raise exception 'task % not found', p_task_id using errcode = 'P0005';
  end if;
  v_from := t.state;

  -- Who may call. A user acts only on their own tasks. Every other actor is
  -- server-side and needs the service role, so a browser cannot claim to be an
  -- agent even though this function is security definer.
  if p_actor = 'user' and t.owner_id is distinct from auth.uid() then
    raise exception 'not your task' using errcode = '42501';
  end if;
  if p_actor <> 'user' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'actor % requires the service role', p_actor using errcode = '42501';
  end if;

  select exists (
    select 1 from task_transitions
    where from_state = v_from and to_state = p_to and p_actor = any(actors)
  ) or (p_to = 'cancelled' and v_from not in ('done','cancelled') and p_actor = 'user')
  into allowed;

  if not allowed then
    raise exception 'illegal transition % -> % by %', v_from, p_to, p_actor
      using errcode = 'P0001';
  end if;

  -- Approval pins the spec you actually read. If a newer version landed between
  -- opening the page and clicking approve, refuse rather than silently approving
  -- something you have not seen.
  if v_from = 'awaiting_approval' and p_to = 'ready_to_pull' then
    if t.current_spec_id is null then
      raise exception 'no spec to approve' using errcode = 'P0006';
    end if;
    if p_patch ? 'expected_spec_id'
       and (p_patch->>'expected_spec_id')::uuid is distinct from t.current_spec_id then
      raise exception 'spec changed since you opened it' using errcode = 'P0002';
    end if;
  end if;

  perform set_config('app.transition', 'on', true);
  update tasks set
    state = p_to,
    approved_spec_id = case when v_from = 'awaiting_approval' and p_to = 'ready_to_pull'
                            then t.current_spec_id else approved_spec_id end,
    branch          = coalesce(p_patch->>'branch', branch),
    pr_number       = coalesce((p_patch->>'pr_number')::int, pr_number),
    pr_url          = coalesce(p_patch->>'pr_url', pr_url),
    current_spec_id = coalesce((p_patch->>'current_spec_id')::uuid, current_spec_id),
    blocked_reason  = case when p_to = 'blocked' then p_reason else null end,
    locked_by = case when p_to = 'in_progress' then coalesce(p_patch->>'locked_by', locked_by)
                     when p_to in ('in_review','blocked','done','cancelled','ready_to_pull') then null
                     else locked_by end,
    locked_at = case when p_to = 'in_progress' then now()
                     when p_to in ('in_review','blocked','done','cancelled','ready_to_pull') then null
                     else locked_at end,
    updated_at = now()
  where id = p_task_id returning * into t;
  perform set_config('app.transition', 'off', true);

  insert into task_events(task_id, from_state, to_state, actor, reason)
  values (p_task_id, v_from, p_to, p_actor, p_reason);

  perform enqueue_for_state(t, v_from, p_patch);
  return t;
end $$;

revoke all on function transition_task(uuid, task_state, actor_kind, text, jsonb)
  from public, anon;
grant execute on function transition_task(uuid, task_state, actor_kind, text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_task
-- ---------------------------------------------------------------------------

-- Locks the project row so two concurrent calls cannot allocate the same key.
create or replace function create_task(
  p_project_id uuid,
  p_title text,
  p_description text default '',
  p_priority smallint default 2,
  p_labels text[] default '{}'
) returns tasks
language plpgsql security definer set search_path = public as $$
declare
  p projects;
  t tasks;
  v_key text;
begin
  select * into p from projects where id = p_project_id for update;
  if not found then
    raise exception 'project % not found', p_project_id using errcode = 'P0005';
  end if;

  -- security definer bypasses RLS, so ownership is checked explicitly.
  if p.owner_id is distinct from auth.uid() then
    raise exception 'not your project' using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title is required' using errcode = 'P0007';
  end if;

  v_key := p.key_prefix || '-' || p.next_task_number;
  update projects set next_task_number = next_task_number + 1 where id = p.id;

  insert into tasks (project_id, owner_id, key, title, description, priority, labels, state)
  values (p.id, p.owner_id, v_key, p_title, coalesce(p_description, ''),
          coalesce(p_priority, 2::smallint), coalesce(p_labels, '{}'), 'draft')
  returning * into t;

  return t;
end $$;

revoke all on function create_task(uuid, text, text, smallint, text[]) from public, anon;
grant execute on function create_task(uuid, text, text, smallint, text[])
  to authenticated, service_role;
