-- create_task: key allocation and ownership (T-104, LLD §3).

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email) values
 ('c1111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@example.com'),
 ('d2222222-2222-4222-8222-222222222222',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','d@example.com');

insert into projects (id, owner_id, name, key_prefix, repo_owner, repo_name) values
 ('c0000000-0000-4000-8000-00000000000c','c1111111-1111-4111-8111-111111111111',
  'C','PM','owner','repo');

select set_config('request.jwt.claims',
  '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Keys are allocated in order from the project prefix -------------------------
select is((create_task('c0000000-0000-4000-8000-00000000000c','first')).key, 'PM-1',
          'the first task is PM-1');
select is((create_task('c0000000-0000-4000-8000-00000000000c','second')).key, 'PM-2',
          'the second task is PM-2');
select is((create_task('c0000000-0000-4000-8000-00000000000c','third')).key, 'PM-3',
          'the third task is PM-3');

select is((select next_task_number from projects
           where id = 'c0000000-0000-4000-8000-00000000000c'), 4,
          'the counter tracks the keys handed out');

-- A task always starts as a draft, whatever else is passed --------------------
select is((create_task('c0000000-0000-4000-8000-00000000000c','fourth')).state,
          'draft'::task_state, 'a new task starts in draft');

-- Ownership --------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select throws_ok(
  $$ select create_task('c0000000-0000-4000-8000-00000000000c','sneaky') $$,
  '42501', null, 'a user cannot create a task in another user project');

select set_config('request.jwt.claims',
  '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ select create_task('99999999-9999-4999-8999-999999999999','orphan') $$,
  'P0005', null, 'creating a task in a project that does not exist is rejected');

select throws_ok(
  $$ select create_task('c0000000-0000-4000-8000-00000000000c','   ') $$,
  'P0007', null, 'a blank title is rejected');

select * from finish();
rollback;
