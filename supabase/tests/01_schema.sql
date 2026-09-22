-- Schema structure and constraints (T-104, LLD §3).
-- Guards against a migration silently dropping a table, index or check.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Tables ---------------------------------------------------------------------
select has_table('public', t, format('table %s exists', t))
from unnest(array['projects','tasks','task_specs','comments','agent_runs',
                  'run_logs','task_events','github_events','settings',
                  'task_transitions']) as t;

-- Enums ----------------------------------------------------------------------
select has_enum('public', 'task_state', 'enum task_state exists');
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'task_state'),
  9, 'task_state has 9 values');
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'actor_kind'),
  4, 'actor_kind has 4 values');
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'run_kind'),
  3, 'run_kind has 3 values');
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'run_status'),
  5, 'run_status has 5 values');

-- task_state must stay in lifecycle order: guard_spec_insert compares with >=,
-- so reordering the enum would silently change which states accept a new spec.
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'task_state'),
  array['draft','refining','awaiting_approval','ready_to_pull','in_progress',
        'blocked','in_review','done','cancelled'],
  'task_state is declared in lifecycle order');

-- Functions ------------------------------------------------------------------
select has_function('public', f, format('function %s exists', f))
from unnest(array['transition_task','create_task','enqueue_for_state']) as f;

-- Keys and indexes -----------------------------------------------------------
select col_is_pk('public', 'tasks', 'id', 'tasks has a primary key');
select col_is_unique('public', 'tasks', 'key', 'task keys are unique');
select col_is_unique('public', 'task_specs', array['task_id','version'],
                     'one row per task/version');
select col_is_unique('public', 'run_logs', array['run_id','seq'],
                     'run log sequence numbers are unique per run');
select col_is_pk('public', 'github_events', 'delivery_id',
                 'webhook deliveries dedupe on delivery_id');

-- One task per PR keeps webhook-to-task mapping unambiguous (LLD §9).
select isnt_empty(
  $$ select 1 from pg_indexes where tablename = 'tasks'
     and indexdef like '%pr_number%' and indexdef like '%UNIQUE%' $$,
  'partial unique index on (project_id, pr_number)');

-- Realtime and Storage -------------------------------------------------------
select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime'
     and tablename in ('tasks','task_specs','comments','agent_runs','run_logs')),
  5, 'all five tables are in the realtime publication');

select is((select public from storage.buckets where id = 'runs'), false,
          'the runs bucket is private');

-- Check constraints ----------------------------------------------------------
select throws_ok(
  $$ insert into projects (owner_id,name,key_prefix,repo_owner,repo_name)
     values (gen_random_uuid(),'x','lowercase','o','r') $$,
  '23514', null, 'key_prefix must be 2-6 uppercase letters');

select throws_ok(
  $$ insert into run_logs (run_id,seq,level,kind,message)
     values (gen_random_uuid(),1,'verbose','text','x') $$,
  '23514', null, 'run_logs.level is constrained');

select * from finish();
rollback;
