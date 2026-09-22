-- Row level security and Storage policies (T-104, LLD §3).
--
-- Unlike 02_state_machine.sql, these tests must switch the Postgres role:
-- RLS is enforced per role, and the superuser bypasses it entirely. Setting
-- only the JWT claims would leave RLS untested while appearing to pass.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Fixtures: two users, each with a project, a task, a spec and a run ----------
insert into auth.users (id, instance_id, aud, role, email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@example.com'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@example.com');

insert into projects (id, owner_id, name, key_prefix, repo_owner, repo_name) values
 ('a0000000-0000-4000-8000-00000000000a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A','AA','o','r'),
 ('b0000000-0000-4000-8000-00000000000b','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B','BB','o','r');

insert into tasks (id, project_id, owner_id, key, title) values
 ('a1000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-00000000000a',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','AA-1','A task'),
 ('b1000000-0000-4000-8000-00000000000b','b0000000-0000-4000-8000-00000000000b',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','BB-1','B task');

insert into task_specs (id, task_id, version, content) values
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-00000000000a',1,'{}'::jsonb);

insert into agent_runs (id, task_id, kind, prompt_version, model, input_snapshot) values
 ('a3000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-00000000000a',
  'refine','refine.v1','claude-sonnet-5','{}'::jsonb);

insert into comments (task_id, author, body) values
 ('a1000000-0000-4000-8000-00000000000a','agent','a question');

insert into task_events (task_id, from_state, to_state, actor) values
 ('a1000000-0000-4000-8000-00000000000a','draft','refining','user');

insert into run_logs (run_id, seq, level, kind, message) values
 ('a3000000-0000-4000-8000-00000000000a',1,'info','text','hello');

insert into storage.objects (bucket_id, name) values
 ('runs','a3000000-0000-4000-8000-00000000000a/transcript.jsonl');

insert into github_events (delivery_id, event, payload) values
 ('delivery-1','pull_request','{}'::jsonb);

-- As user A -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select is((select count(*) from projects)::int, 1, 'A sees only their own project');
select is((select count(*) from tasks)::int, 1, 'A sees only their own task');
select is((select count(*) from task_specs)::int, 1, 'A sees their own spec');
select is((select count(*) from agent_runs)::int, 1, 'A sees their own run');
select is((select count(*) from run_logs)::int, 1, 'A sees their own run logs');
select is((select count(*) from comments)::int, 1, 'A sees their own comments');
select is((select count(*) from task_events)::int, 1, 'A sees their own events');
select is((select count(*) from settings)::int, 1, 'A sees only their own settings row');
select is((select count(*) from storage.objects where bucket_id='runs')::int, 1,
          'A can read the transcript of their own run');

-- Tables only the service role touches.
select is((select count(*) from github_events)::int, 0,
          'github_events is invisible to a signed-in user');

reset role;

-- As user B -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select is((select count(*) from tasks)::int, 1, 'B sees only their own task');
select is((select count(*) from task_specs)::int, 0, 'B cannot see A spec');
select is((select count(*) from agent_runs)::int, 0, 'B cannot see A run');
select is((select count(*) from run_logs)::int, 0, 'B cannot see A run logs');
select is((select count(*) from storage.objects where bucket_id='runs')::int, 0,
          'B cannot read A transcript');

-- A write against A's rows must affect nothing rather than erroring, since RLS
-- filters the rows out before the update sees them.
update tasks set title = 'hacked' where id = 'a1000000-0000-4000-8000-00000000000a';
select is((select count(*) from tasks where title = 'hacked')::int, 0,
          'B cannot rename A task');

-- A task may only be created in draft; anything else is an RLS violation.
select throws_ok(
  $$ insert into tasks (project_id, owner_id, key, title, state)
     values ('b0000000-0000-4000-8000-00000000000b',
             'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','BB-9','sneaky','in_review') $$,
  '42501', null, 'a task cannot be inserted in a non-draft state');

-- Only the orchestrator writes run artifacts.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('runs','b3000000-0000-4000-8000-00000000000b/evil.txt') $$,
  '42501', null, 'a signed-in user cannot upload into the runs bucket');

reset role;

select * from finish();
rollback;
