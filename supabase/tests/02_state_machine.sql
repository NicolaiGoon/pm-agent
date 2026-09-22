-- State machine: transitions, actors, cancel rule, approval guard, guard
-- trigger and the audit trail (T-104, LLD §4).
--
-- transition_task and create_task read auth.uid() / auth.role() from the
-- request.jwt.claims GUC, not from the Postgres role, so these tests switch
-- identity by setting claims and stay superuser. RLS is covered in 03_rls.sql,
-- where the role does have to change.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
 ('11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','sm@example.com');

insert into projects (id, owner_id, name, key_prefix, repo_owner, repo_name) values
 ('22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111','SM','SM','owner','repo');

create function pg_temp.as_user() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
$$;

create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

-- Builds a task already sitting in the given state, bypassing the guard the
-- same way transition_task does. A spec is attached first, while the task is
-- still a draft, so approval transitions have something to pin.
create function pg_temp.mk(p_state task_state) returns uuid
language plpgsql as $$
declare v_id uuid; v_spec uuid;
begin
  insert into tasks (project_id, owner_id, key, title)
  values ('22222222-2222-4222-8222-222222222222',
          '11111111-1111-4111-8111-111111111111',
          'SM-' || nextval('pg_temp.seq')::text, 'fixture')
  returning id into v_id;

  insert into task_specs (task_id, version, content)
  values (v_id, 1, '{}'::jsonb) returning id into v_spec;

  update tasks set current_spec_id = v_spec where id = v_id;

  perform set_config('app.transition', 'on', true);
  update tasks set state = p_state where id = v_id;
  perform set_config('app.transition', 'off', true);
  return v_id;
end $$;

create sequence pg_temp.seq start 1;

-- Every seeded transition is accepted for each of its actors ------------------
create function pg_temp.all_legal() returns text language plpgsql as $$
declare r record; a text; tid uuid; bad text := '';
begin
  for r in select * from task_transitions order by from_state, to_state loop
    foreach a in array r.actors::text[] loop
      begin
        tid := pg_temp.mk(r.from_state);
        if a = 'user' then perform pg_temp.as_user();
        else perform pg_temp.as_service(); end if;
        perform transition_task(tid, r.to_state, a::actor_kind, 'pgtap');
      exception when others then
        bad := bad || format('%s->%s by %s failed: %s. ',
                             r.from_state, r.to_state, a, sqlerrm);
      end;
    end loop;
  end loop;
  return bad;
end $$;

select is(pg_temp.all_legal(), '',
          'every seeded transition is accepted for each of its actors');

select is((select count(*)::int from task_transitions), 14,
          'the seed holds exactly the 14 concrete transitions');

-- Illegal transitions ---------------------------------------------------------
select pg_temp.as_user();

select throws_ok(
  format($$ select transition_task(%L::uuid,'done','user') $$, pg_temp.mk('draft')),
  'P0001', null, 'draft -> done is rejected');

select throws_ok(
  format($$ select transition_task(%L::uuid,'in_progress','user') $$, pg_temp.mk('ready_to_pull')),
  'P0001', null, 'a user cannot claim a task for the agent');

select throws_ok(
  format($$ select transition_task(%L::uuid,'done','user') $$, pg_temp.mk('in_review')),
  'P0001', null, 'only github marks a PR merged');

select throws_ok(
  format($$ select transition_task(%L::uuid,'refining','user') $$, pg_temp.mk('done')),
  'P0001', null, 'a finished task cannot be reopened');

-- A browser session must not be able to act as any server-side actor, even
-- though transition_task is security definer.
select throws_ok(
  format($$ select transition_task(%L::uuid,'awaiting_approval','agent') $$, pg_temp.mk('refining')),
  '42501', null, 'actor agent requires the service role');

select throws_ok(
  format($$ select transition_task(%L::uuid,'done','github') $$, pg_temp.mk('in_review')),
  '42501', null, 'actor github requires the service role');

select throws_ok(
  format($$ select transition_task(%L::uuid,'ready_to_pull','system') $$, pg_temp.mk('in_progress')),
  '42501', null, 'actor system requires the service role');

-- system is the only actor that may release a stale lock.
select pg_temp.as_service();
select throws_ok(
  format($$ select transition_task(%L::uuid,'ready_to_pull','agent') $$, pg_temp.mk('in_progress')),
  'P0001', null, 'only the sweeper returns a stale lock to ready_to_pull');

select lives_ok(
  format($$ select transition_task(%L::uuid,'ready_to_pull','system') $$, pg_temp.mk('in_progress')),
  'the sweeper may return a stale lock to ready_to_pull');

-- The cancel wildcard ---------------------------------------------------------
select pg_temp.as_user();

create function pg_temp.cancel_all_live() returns text language plpgsql as $$
declare s task_state; tid uuid; bad text := '';
begin
  foreach s in array array['draft','refining','awaiting_approval','ready_to_pull',
                           'in_progress','blocked','in_review']::task_state[] loop
    begin
      tid := pg_temp.mk(s);
      perform pg_temp.as_user();
      perform transition_task(tid, 'cancelled', 'user', 'pgtap');
    exception when others then
      bad := bad || format('cancel from %s failed: %s. ', s, sqlerrm);
    end;
  end loop;
  return bad;
end $$;

select is(pg_temp.cancel_all_live(), '',
          'a user can cancel from every live state');

select throws_ok(
  format($$ select transition_task(%L::uuid,'cancelled','user') $$, pg_temp.mk('done')),
  'P0001', null, 'a done task cannot be cancelled');

select throws_ok(
  format($$ select transition_task(%L::uuid,'cancelled','user') $$, pg_temp.mk('cancelled')),
  'P0001', null, 'an already cancelled task cannot be cancelled again');

select pg_temp.as_service();
select throws_ok(
  format($$ select transition_task(%L::uuid,'cancelled','agent') $$, pg_temp.mk('in_progress')),
  'P0001', null, 'an agent cannot cancel a task');
select throws_ok(
  format($$ select transition_task(%L::uuid,'cancelled','github') $$, pg_temp.mk('in_review')),
  'P0001', null, 'github cannot cancel a task');

-- Approval guard ---------------------------------------------------------------
select pg_temp.as_user();

select throws_ok(
  format($$ select transition_task(%L::uuid,'ready_to_pull','user',null,
           '{"expected_spec_id":"99999999-9999-4999-8999-999999999999"}'::jsonb) $$,
         pg_temp.mk('awaiting_approval')),
  'P0002', null, 'approving a spec that changed under you is rejected');

-- Approving without expected_spec_id still works (the guard is opt-in), and it
-- pins whatever was current at click time.
create function pg_temp.approve_pins() returns boolean language plpgsql as $$
declare tid uuid; t tasks;
begin
  tid := pg_temp.mk('awaiting_approval');
  perform pg_temp.as_user();
  select * into t from transition_task(tid, 'ready_to_pull', 'user');
  return t.approved_spec_id is not null and t.approved_spec_id = t.current_spec_id;
end $$;
select ok(pg_temp.approve_pins(), 'approval pins approved_spec_id to the current spec');

-- A task in awaiting_approval with no spec at all cannot be approved.
create function pg_temp.approve_without_spec() returns text language plpgsql as $$
declare tid uuid;
begin
  tid := pg_temp.mk('awaiting_approval');
  update tasks set current_spec_id = null where id = tid;
  perform pg_temp.as_user();
  begin
    perform transition_task(tid, 'ready_to_pull', 'user');
    return 'no error';
  exception when others then
    return sqlstate;
  end;
end $$;
select is(pg_temp.approve_without_spec(), 'P0006',
          'a task with no spec cannot be approved');

-- The guard trigger --------------------------------------------------------------
select throws_ok(
  format($$ update tasks set state = 'done' where id = %L $$, pg_temp.mk('draft')),
  'P0003', null, 'a direct state update is blocked');

select throws_ok(
  format($$ update tasks set locked_by = 'thief', locked_at = now() where id = %L $$,
         pg_temp.mk('ready_to_pull')),
  'P0003', null, 'a direct lock grab is blocked');

select throws_ok(
  format($$ update tasks set pr_number = 99 where id = %L $$, pg_temp.mk('in_progress')),
  'P0003', null, 'a direct pr_number write is blocked');

select lives_ok(
  format($$ update tasks set title = 'renamed' where id = %L $$, pg_temp.mk('draft')),
  'ordinary column edits are still allowed');

-- Locks and the audit trail --------------------------------------------------------
create function pg_temp.lock_cycle() returns text language plpgsql as $$
declare tid uuid; t tasks;
begin
  tid := pg_temp.mk('ready_to_pull');
  perform pg_temp.as_service();
  select * into t from transition_task(tid,'in_progress','agent',null,
    '{"locked_by":"worker-1","branch":"agent/SM-1-x"}'::jsonb);
  if t.locked_by is distinct from 'worker-1' or t.locked_at is null then
    return 'lock not taken';
  end if;
  select * into t from transition_task(tid,'in_review','github',null,
    '{"pr_number":7}'::jsonb);
  if t.locked_by is not null or t.locked_at is not null then
    return 'lock not released';
  end if;
  if t.pr_number is distinct from 7 then return 'patch not applied'; end if;
  return 'ok';
end $$;
select is(pg_temp.lock_cycle(), 'ok',
          'the lock is taken on in_progress and released on in_review');

-- Exactly one audit row per transition, and none for a failed one.
create function pg_temp.events_per_transition() returns int language plpgsql as $$
declare tid uuid; n int;
begin
  tid := pg_temp.mk('draft');
  perform pg_temp.as_user();
  perform transition_task(tid,'refining','user');
  begin
    perform transition_task(tid,'done','user');   -- illegal, must leave no trace
  exception when others then null;
  end;
  select count(*) into n from task_events where task_id = tid;
  return n;
end $$;
select is(pg_temp.events_per_transition(), 1,
          'one audit row per successful transition and none for a rejected one');

select * from finish();
rollback;
