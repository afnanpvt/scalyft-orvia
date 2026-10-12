// Applies every migration to an in-process Postgres (PGlite) and attacks the
// result the way a hostile signed-in user would: with the anon key and their
// own session, using any query they like. No Supabase project needed.
//
//   npm test
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, '..', 'migrations');
const db = new PGlite({ extensions: { uuid_ossp } });

// --- Stand-in for what Supabase provides --------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(),
    last_sign_in_at timestamptz, email_confirmed_at timestamptz, raw_user_meta_data jsonb, banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public, auth to anon, authenticated, service_role;
  -- Supabase grants everything on new tables and EXECUTE on new functions to
  -- these roles. Mimic that so a missing REVOKE shows up as a failing test.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);

// The live schema has users.theme_preference but no migration adds it. Add it
// the same way here, so 017 is exercised against the drifted shape.
const files = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
// WITHOUT_017=1 skips the hardening, to prove these tests fail on the old schema.
const skip017 = process.env.WITHOUT_017 === '1';
for (const f of files) {
  if (skip017 && f.startsWith('017')) continue;
  let sql = readFileSync(join(migrations, f), 'utf8');
  sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS pg_cron;/gi, '');
  sql = sql.replace(/^\s*SELECT\s+cron\.schedule\([^;]*\);/gim, '');
  await db.exec(sql);
  if (f.startsWith('001')) await db.exec(`alter table users add column theme_preference text`);
}
// Migrations are meant to be re-runnable. Apply the hardening a second time.
if (!skip017) await db.exec(readFileSync(join(migrations, '017_client_hardening.sql'), 'utf8'));
await db.exec(readFileSync(join(migrations, '018_mobile_app.sql'), 'utf8'));
// 019 again, to prove it is re-runnable (the cron line needs pg_cron, which PGlite lacks).
await db.exec(readFileSync(join(migrations, '019_public_demo_and_demo_accounts.sql'), 'utf8').replace(/^\s*SELECT\s+cron\.schedule\([^;]*\);/gim, ''));

// --- Tiny test harness ----------------------------------------------------------
let passed = 0, failed = 0;
const ok = (name) => { passed++; console.log(`  ok   ${name}`); };
const bad = (name, why) => { failed++; console.log(`  FAIL ${name}: ${why}`); };
const eq = (name, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? ok(name) : bad(name, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));

async function as(role, uid, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const rows = (uid, sql, params) => as('authenticated', uid, async () => (await db.query(sql, params)).rows);
const rowsAs = (role, uid, sql, params) => as(role, uid, async () => (await db.query(sql, params)).rows);

async function denied(name, uid, sql, params = [], expect = 'permission denied', role = 'authenticated') {
  try {
    await as(role, uid, () => db.query(sql, params));
    bad(name, 'expected an error, but it succeeded');
  } catch (e) {
    e.message.includes(expect) ? ok(name) : bad(name, `error was "${e.message}", wanted "${expect}"`);
  }
}
// An UPDATE/DELETE that RLS filters down to nothing succeeds with 0 rows. That
// is also "denied" as far as the attacker is concerned.
async function touchesNothing(name, uid, sql, params = []) {
  const res = await as('authenticated', uid, () => db.query(sql, params));
  res.affectedRows === 0 ? ok(name) : bad(name, `changed ${res.affectedRows} rows`);
}

// --- Fixtures ---------------------------------------------------------------
const authUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const business = async (name, slug) =>
  (await db.query(`insert into businesses (name, slug, seconds_remaining, timezone, vapi_phone_id) values ($1,$2,3600,'Asia/Kolkata',$3) returning id`, [name, slug, `vapi-${slug}`])).rows[0].id;
const profile = async (id, biz, email, role) => db.query(`insert into users (id, business_id, email, role) values ($1,$2,$3,$4)`, [id, biz, email, role]);

const bizA = await business('Smile Dental', 'smile');
const bizB = await business('Rival Clinic', 'rival');
const ownerA = await authUser('owner-a@x.test');
const adminA = await authUser('admin-a@x.test');
const ownerB = await authUser('owner-b@x.test');
const stranger = await authUser('no-profile@x.test');
await profile(ownerA, bizA, 'owner-a@x.test', 'owner');
await profile(adminA, bizA, 'admin-a@x.test', 'admin');
await profile(ownerB, bizB, 'owner-b@x.test', 'owner');

const seedCall = async (biz, extra = {}) =>
  (await db.query(
    `insert into calls (business_id, vapi_call_id, caller_phone, status, outcome, created_at)
     values ($1, $2, '+919876500000', $3, 'info_given', $4) returning id`,
    [biz, `vc-${Math.random()}`, extra.status ?? 'completed', extra.at ?? new Date().toISOString()],
  )).rows[0].id;
const callA = await seedCall(bizA);
const callB = await seedCall(bizB);
const apptA = (await db.query(`insert into appointments (business_id, call_id, customer_name, customer_phone, scheduled_start) values ($1,$2,'Asha','+919800000001', now() + interval '1 day') returning id`, [bizA, callA])).rows[0].id;
const apptB = (await db.query(`insert into appointments (business_id, call_id, customer_name, customer_phone, scheduled_start) values ($1,$2,'Ravi','+919800000002', now() + interval '1 day') returning id`, [bizB, callB])).rows[0].id;
const leadA = (await db.query(`insert into leads (business_id, call_id, phone) values ($1,$2,'+919800000003') returning id`, [bizA, callA])).rows[0].id;
const queueA = (await db.query(`insert into call_queue (business_id, call_id, queue_type, caller_phone) values ($1,$2,'missed_callback','+919800000004') returning id`, [bizA, callA])).rows[0].id;
const eventA = (await db.query(`insert into operational_events (business_id, call_id, event_type) values ($1,$2,'ai_failure') returning id`, [bizA, callA])).rows[0].id;

// ============================================================================
console.log('\nWhat the dashboard and the app legitimately do');
eq('owner reads own business only', (await rows(ownerA, `select id from businesses`)).map((r) => r.id), [bizA]);
eq('owner reads own calls only', (await rows(ownerA, `select id from calls`)).map((r) => r.id), [callA]);
eq('owner reads own profile only', (await rows(ownerA, `select id from users`)).map((r) => r.id), [ownerA]);

await rows(ownerA, `update businesses set name = 'Smile Dental Care', phone_display = '+91 80 1111 2222', settings = '{"greeting":"Hi"}'::jsonb, updated_at = now() where id = $1`, [bizA]);
eq('owner edits name, display phone and settings', (await db.query(`select name, settings->>'greeting' g from businesses where id = $1`, [bizA])).rows[0], { name: 'Smile Dental Care', g: 'Hi' });

await rows(ownerA, `update users set full_name = 'Dr A', must_change_password = false, theme_preference = 'dark' where id = $1`, [ownerA]);
eq('user edits own name, theme and password flag', (await db.query(`select full_name, theme_preference from users where id = $1`, [ownerA])).rows[0], { full_name: 'Dr A', theme_preference: 'dark' });

await rows(ownerA, `update appointments set status = 'completed', updated_at = now() where id = $1`, [apptA]);
await rows(ownerA, `update leads set status = 'contacted', updated_at = now() where id = $1`, [leadA]);
await rows(ownerA, `update call_queue set status = 'handled', handled_at = now() where id = $1`, [queueA]);
await rows(ownerA, `update operational_events set resolved = true where id = $1`, [eventA]);
await rows(ownerA, `update calls set status = 'completed' where id = $1`, [callA]);
eq('owner triages appointment, lead, queue item, event and call',
  [
    (await db.query(`select status from appointments where id=$1`, [apptA])).rows[0].status,
    (await db.query(`select status from leads where id=$1`, [leadA])).rows[0].status,
    (await db.query(`select status from call_queue where id=$1`, [queueA])).rows[0].status,
    (await db.query(`select resolved from operational_events where id=$1`, [eventA])).rows[0].resolved,
  ],
  ['completed', 'contacted', 'handled', true]);

await rows(adminA, `update businesses set settings = jsonb_set(settings, '{model_config}', '{"llmModel":"x"}') where id = $1`, [bizA]);
eq('admin may change model_config', (await db.query(`select settings->'model_config'->>'llmModel' m from businesses where id=$1`, [bizA])).rows[0].m, 'x');

// ============================================================================
console.log('\nPrivilege escalation');
await denied('cannot make yourself admin', ownerA, `update users set role = 'admin' where id = $1`, [ownerA]);
await denied('cannot move yourself into another business', ownerA, `update users set business_id = $1 where id = $2`, [bizB, ownerA]);
await denied('cannot insert a profile for yourself', stranger, `insert into users (id, business_id, email, role) values ($1, $2, 'x', 'admin')`, [stranger, bizB]);
await denied('cannot delete your profile', ownerA, `delete from users where id = $1`, [ownerA]);
eq('profile rows of others are invisible', (await rows(ownerA, `select id from users where id = $1`, [ownerB])).length, 0);
eq('a user without a profile sees no business', (await rows(stranger, `select id from businesses`)).length, 0);

console.log('\nBilling and number hijacking');
for (const [col, val] of [
  ['seconds_remaining', '999999'], ['allow_overage', 'true'], ['status', `'inactive'`],
  ['vapi_phone_id', `'vapi-rival'`], ['vapi_assistant_id', `'a'`], ['owner_phone', `'+10000000000'`],
  ['ai_number', `'+14155550100'`], ['slug', `'taken'`],
]) {
  await denied(`cannot set businesses.${col}`, ownerA, `update businesses set ${col} = ${val} where id = $1`, [bizA]);
}
await denied('cannot delete the business', ownerA, `delete from businesses where id = $1`, [bizA]);
await denied('cannot create a business', ownerA, `insert into businesses (name, slug) values ('mine','mine')`);
await denied('cannot call deduct_call_seconds', ownerA, `select deduct_call_seconds($1, -100000)`, [bizA]);
await denied('anon cannot call deduct_call_seconds', null, `select deduct_call_seconds($1, 1)`, [bizA], 'permission denied', 'anon');
eq('service role still can', (await rowsAs('service_role', null, `select deduct_call_seconds($1, 60) as left`, [bizA]))[0].left, 3540);
await denied('owner cannot change model_config', ownerA, `update businesses set settings = jsonb_set(settings, '{model_config}', '{"llmModel":"gpt-9"}') where id = $1`, [bizA], 'admin-only');
await rows(ownerA, `update businesses set settings = jsonb_set(settings, '{greeting}', '"Hello"') where id = $1`, [bizA]);
ok('owner can still edit other settings keys');
await rowsAs('service_role', null, `update businesses set settings = jsonb_set(settings, '{model_config}', '{"llmModel":"y"}') where id = $1`, [bizA]);
ok('service role may change model_config');

console.log('\nForging and destroying records');
await denied('cannot insert a call', ownerA, `insert into calls (business_id, status) values ($1, 'completed')`, [bizA]);
await denied('cannot delete a call', ownerA, `delete from calls where id = $1`, [callA]);
await denied('cannot insert an appointment', ownerA, `insert into appointments (business_id, customer_name, customer_phone, scheduled_start) values ($1,'x','1',now())`, [bizA]);
await denied('cannot delete an appointment', ownerA, `delete from appointments where id = $1`, [apptA]);
await denied('cannot insert a lead', ownerA, `insert into leads (business_id, phone) values ($1,'1')`, [bizA]);
await denied('cannot delete a lead', ownerA, `delete from leads where id = $1`, [leadA]);
await denied('cannot insert a queue item', ownerA, `insert into call_queue (business_id, queue_type) values ($1,'missed_callback')`, [bizA]);
await denied('cannot rewrite a transcript', ownerA, `update calls set transcript = '[]'::jsonb where id = $1`, [callA]);
await denied('cannot rewrite a call outcome', ownerA, `update calls set outcome = 'appointment_booked' where id = $1`, [callA]);
await denied('cannot move an appointment to another business', ownerA, `update appointments set business_id = $1 where id = $2`, [bizB, apptA]);
await denied('cannot reassign appointment time', ownerA, `update appointments set scheduled_start = now() where id = $1`, [apptA]);

console.log('\nTenant isolation');
await touchesNothing('cannot update another business appointment', ownerA, `update appointments set status = 'cancelled' where id = $1`, [apptB]);
await touchesNothing('cannot update another business call', ownerA, `update calls set status = 'missed' where id = $1`, [callB]);
await touchesNothing('cannot update another business', ownerA, `update businesses set name = 'pwned' where id = $1`, [bizB]);
eq('B still intact', (await db.query(`select name from businesses where id=$1`, [bizB])).rows[0].name, 'Rival Clinic');
await denied('anon reads nothing', null, `select * from calls`, [], 'permission denied', 'anon');
await denied('anon cannot read businesses', null, `select * from businesses`, [], 'permission denied', 'anon');

// ============================================================================
console.log('\nai_number');
await rowsAs('service_role', null, `update businesses set ai_number = '+918040001000' where id = $1`, [bizA]);
ok('provisioning can set a valid E.164 number');
for (const bad_ of ['918040001000', '+0123456', '+91 80 4000', "+9180';drop table x;--", '+1234']) {
  await denied(`rejects ${JSON.stringify(bad_)}`, null, `update businesses set ai_number = $1 where id = $2`, [bad_, bizA], 'violates check constraint', 'service_role');
}

// ============================================================================
console.log('\nmobile_devices');
const install = 'inst_0123456789abcdef';
await rows(ownerA, `select register_mobile_device($1, 'tok-1', '1.0.0', '{"mode":"conditional","status":"active"}')`, [install]);
let dev = (await db.query(`select business_id, push_token, forwarding from mobile_devices`)).rows;
eq('register stores the business from the profile, not from the client', [dev.length, dev[0].business_id, dev[0].push_token, dev[0].forwarding.status], [1, bizA, 'tok-1', 'active']);
await rows(ownerA, `select register_mobile_device($1, 'tok-2', '1.0.1', null)`, [install]);
dev = (await db.query(`select push_token, app_version, forwarding from mobile_devices`)).rows;
eq('re-register updates in place and keeps forwarding when null is sent', [dev.length, dev[0].push_token, dev[0].app_version, dev[0].forwarding.status], [1, 'tok-2', '1.0.1', 'active']);

await rows(ownerB, `select register_mobile_device('inst_B_0123456789abcd', 'tok-2', '1.0.0', '{}')`);
dev = (await db.query(`select user_id, push_token from mobile_devices order by created_at`)).rows;
eq('a push token moves to the newest install', dev.map((d) => [d.user_id === ownerA, d.push_token]), [[true, null], [false, 'tok-2']]);

eq('users only see their own devices', (await rows(ownerA, `select installation_id from mobile_devices`)).map((r) => r.installation_id), [install]);
await denied('cannot insert a device row directly', ownerA, `insert into mobile_devices (business_id, user_id, installation_id) values ($1,$2,'inst_0123456789abcdee')`, [bizA, ownerA]);
await denied('cannot update a device row directly', ownerA, `update mobile_devices set push_token = 'x'`);
await denied('anon cannot register', null, `select register_mobile_device('inst_0123456789abcdef','t','1','{}')`, [], 'permission denied', 'anon');
await denied('rejects a malformed installation id', ownerA, `select register_mobile_device('short', 't', '1', '{}')`, [], 'invalid installation id');
await denied('rejects oversized forwarding blob', ownerA, `select register_mobile_device($1, 't', '1', $2::jsonb)`, [install, JSON.stringify({ x: 'a'.repeat(4000) })], 'small object');
await denied('rejects non-object forwarding', ownerA, `select register_mobile_device($1, 't', '1', '[1]')`, [install], 'small object');
await denied('profile-less user cannot register', stranger, `select register_mobile_device($1, 't', '1', '{}')`, [install], 'no business');
await rows(ownerB, `select unregister_mobile_device($1)`, [install]);
eq('unregister is scoped to the caller', (await db.query(`select count(*)::int c from mobile_devices`)).rows[0].c, 2);
await rows(ownerA, `select unregister_mobile_device($1)`, [install]);
eq('owner can unregister own install', (await db.query(`select count(*)::int c from mobile_devices`)).rows[0].c, 1);

const countA = async () => (await db.query(`select count(*)::int c from mobile_devices where user_id = $1`, [ownerA])).rows[0].c;
for (let i = 0; i < 12; i++) {
  await rows(ownerA, `select register_mobile_device($1, null, '1.0.0', '{}')`, [`inst_flood_${String(i).padStart(10, '0')}`]);
}
eq('one account keeps at most 10 installs', await countA(), 10);
eq('the newest install survives the cap', (await db.query(`select count(*)::int c from mobile_devices where installation_id = 'inst_flood_0000000011'`)).rows[0].c, 1);
await db.query(`update mobile_devices set last_seen_at = now() - interval '61 days' where installation_id = 'inst_flood_0000000005'`);
await rows(ownerA, `select register_mobile_device('inst_flood_0000000011', null, '1.0.0', null)`);
eq('installs silent for 60 days are forgotten', (await db.query(`select count(*)::int c from mobile_devices where installation_id = 'inst_flood_0000000005'`)).rows[0].c, 0);
eq('the cap never touches another account', (await db.query(`select count(*)::int c from mobile_devices where user_id <> $1`, [ownerA])).rows[0].c, 1);
await db.query(`delete from mobile_devices where user_id = $1`, [ownerA]);

// ============================================================================
console.log('\nmobile_overview');
await rowsAs('service_role', null, `update businesses set ai_number = '+918040001000' where id = $1`, [bizB]);
await seedCall(bizA, { status: 'missed' });
await seedCall(bizA, { status: 'in_progress' });
await seedCall(bizA, { status: 'completed', at: new Date(Date.now() - 5 * 86400e3).toISOString() });
const o = (await rows(ownerA, `select mobile_overview() as o`))[0].o;
eq('overview names the caller business', o.business.name, 'Smile Dental Care');
eq('overview counts today (3 today, 1 five days ago excluded)', o.today.calls, 3);
eq('overview counts missed today', o.today.missed, 1);
eq('overview finds the live call', o.live_call !== null && o.live_call.caller_phone === '+919876500000', true);
eq('overview counts pending follow-ups', o.pending_followups, 0); // queueA was handled above
eq('overview counts upcoming appointments', o.upcoming_appointments, 0); // apptA was completed above
eq('overview exposes seconds remaining', o.business.seconds_remaining, 3540);
const ob = (await rows(ownerB, `select mobile_overview() as o`))[0].o;
eq('overview is scoped to the caller (B sees only B)', [ob.business.name, ob.today.calls, ob.business.ai_number], ['Rival Clinic', 1, '+918040001000']);
eq('overview of a user with no business is null', (await rows(stranger, `select mobile_overview() as o`))[0].o, null);
await denied('anon cannot read the overview', null, `select mobile_overview()`, [], 'permission denied', 'anon');

// ============================================================================
console.log('\npatch_business_settings');
await rowsAs('service_role', null, `update businesses set settings = '{"greeting":"Old","hours":"9-5","faq":[{"question":"q","answer":"a"}]}'::jsonb where id = $1`, [bizA]);
await rows(ownerA, `select patch_business_settings('{"greeting":"Welcome to Smile","transfer_number":"+919800000009"}')`);
let st = (await db.query(`select settings from businesses where id=$1`, [bizA])).rows[0].settings;
eq('merges the allowed keys', [st.greeting, st.transfer_number], ['Welcome to Smile', '+919800000009']);
eq('leaves every other setting untouched', [st.hours, st.faq.length], ['9-5', 1]);
await rows(ownerA, `select patch_business_settings('{"transfer_number":null,"greeting":""}')`);
st = (await db.query(`select settings from businesses where id=$1`, [bizA])).rows[0].settings;
eq('null or empty clears a setting', ['greeting' in st, 'transfer_number' in st, st.hours], [false, false, '9-5']);
await denied('refuses keys outside the allow-list', ownerA, `select patch_business_settings('{"model_config":{"llmModel":"x"}}')`, [], 'cannot be changed');
await denied('refuses seconds_remaining smuggled as a setting', ownerA, `select patch_business_settings('{"seconds_remaining":5}')`, [], 'cannot be changed');
await denied('rejects a malformed phone number', ownerA, `select patch_business_settings('{"transfer_number":"98765"}')`, [], 'international number');
await denied('rejects an injection attempt in a phone number', ownerA, `select patch_business_settings($1::jsonb)`, [JSON.stringify({ transfer_number: '+91980000000#' })], 'international number');
await denied('rejects a non-text value', ownerA, `select patch_business_settings('{"greeting":42}')`, [], 'must be text');
await denied('rejects an overlong greeting', ownerA, `select patch_business_settings($1::jsonb)`, [JSON.stringify({ greeting: 'x'.repeat(501) })], 'too long');
await denied('rejects a non-object patch', ownerA, `select patch_business_settings('[1]')`, [], 'must be an object');
await denied('anon cannot patch settings', null, `select patch_business_settings('{}')`, [], 'permission denied', 'anon');
await denied('a user with no business cannot patch', stranger, `select patch_business_settings('{"greeting":"x"}')`, [], 'no business');
eq('business B settings were never touched', (await db.query(`select settings from businesses where id=$1`, [bizB])).rows[0].settings, {});

// ============================================================================
console.log('\nPublic demo token limits (claim_demo_token)');
const claim = (ip) => rowsAs('service_role', null, `select claim_demo_token($1, 600) as v`, [ip]).then((r) => r[0].v);
const setLimits = (cap, per) => rows(adminA, `select admin_set_demo_limits($1, $2)`, [cap, per]);
eq('defaults: no daily cap, 6 per visitor', (await rows(adminA, `select daily_cap, per_visitor from admin_get_demo_limits()`))[0], { daily_cap: null, per_visitor: 6 });
await setLimits(null, 3);
eq('first requests from a visitor are allowed', [await claim('ip-a'), await claim('ip-a'), await claim('ip-a')], ['ok', 'ok', 'ok']);
eq('a visitor over their limit is refused', await claim('ip-a'), 'ip_limit');
eq('another visitor is unaffected', await claim('ip-b'), 'ok');
eq('a refused request is not recorded', (await db.query(`select count(*)::int n from demo_token_hits where ip_hash = 'ip-a'`)).rows[0].n, 3);
eq('with no daily cap many visitors get through', (await Promise.all(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map(claim))).every((v) => v === 'ok'), true);
await setLimits(4, 3);
eq('a daily cap stops everyone once reached', await claim('ip-c'), 'daily_cap');
eq('the admin sees how many calls started today', (await rows(adminA, `select used_24h from admin_get_demo_limits()`))[0].used_24h, 10);
await setLimits(0, 3);
eq('a cap of 0 pauses the demo', await claim('ip-d'), 'daily_cap');
await setLimits(null, 3);
eq('removing the cap reopens the demo', await claim('ip-d'), 'ok');
await denied('a non-admin cannot read the limits', ownerA, `select * from admin_get_demo_limits()`, [], 'admin only');
await denied('a non-admin cannot change the limits', ownerA, `select admin_set_demo_limits(5, 5)`, [], 'admin only');
await denied('anon cannot change the limits', null, `select admin_set_demo_limits(5, 5)`, [], 'permission denied', 'anon');
await denied('a negative cap is refused', adminA, `select admin_set_demo_limits(-1, 5)`, [], 'daily cap must be');
await denied('a per visitor limit of 0 is refused', adminA, `select admin_set_demo_limits(5, 0)`, [], 'per visitor limit');
await denied('a per visitor limit above 100 is refused', adminA, `select admin_set_demo_limits(5, 101)`, [], 'per visitor limit');
await denied('anon cannot claim tokens', null, `select claim_demo_token('x', 60)`, [], 'permission denied', 'anon');
await denied('signed-in users cannot claim tokens', ownerA, `select claim_demo_token('x', 60)`);
await denied('anon cannot read the limits table', null, `select * from demo_limits`, [], 'permission denied', 'anon');
await denied('signed-in users cannot read the limits table', ownerA, `select * from demo_limits`);
await denied('anon cannot read the hit log', null, `select * from demo_token_hits`, [], 'permission denied', 'anon');
await denied('signed-in users cannot read the hit log', ownerA, `select * from demo_token_hits`);

// ============================================================================
console.log('\nTime-limited demo accounts');
await denied('an owner cannot extend their own demo', ownerA, `update users set demo_expires_at = null where id = $1`, [ownerA]);
await denied('an owner cannot set a demo date on themselves', ownerA, `update users set demo_expires_at = now() + interval '1 year' where id = $1`, [ownerA]);
await denied('a non-admin cannot set demo access', ownerA, `select admin_set_demo_expiry($1, 7)`, [ownerB], 'admin only');
await denied('anon cannot set demo access', null, `select admin_set_demo_expiry($1, 7)`, [ownerB], 'permission denied', 'anon');
await denied('an admin cannot limit themselves', adminA, `select admin_set_demo_expiry($1, 7)`, [adminA], 'cannot change your own');
await denied('days above 90 are refused', adminA, `select admin_set_demo_expiry($1, 91)`, [ownerB], 'between 1 and 90');
await denied('unknown users are refused', adminA, `select admin_set_demo_expiry($1, 7)`, ['00000000-0000-4000-8000-000000000000'], 'no such user');

const until = (await rows(adminA, `select admin_set_demo_expiry($1, 7) as t`, [ownerB]))[0].t;
eq('an admin makes a login a 7 day demo', Math.round((new Date(until).getTime() - Date.now()) / 86_400_000), 7);
const listed = (await rows(adminA, `select id, demo_expires_at from admin_list_users()`)).find((u) => u.id === ownerB);
eq('the user directory shows the demo date', !!listed?.demo_expires_at, true);
eq('a running demo is not banned', (await db.query(`select banned_until from auth.users where id = $1`, [ownerB])).rows[0].banned_until, null);

await db.query(`update users set demo_expires_at = now() - interval '1 minute' where id = $1`, [ownerB]);
await denied('signed-in users cannot run the expiry sweep', ownerA, `select expire_demo_accounts()`);
eq('the sweep bans exactly the expired demo', (await rowsAs('service_role', null, `select expire_demo_accounts() as n`))[0].n, 1);
eq('an expired demo login is banned for good', (await db.query(`select banned_until > now() + interval '50 years' as b from auth.users where id = $1`, [ownerB])).rows[0].b, true);
eq('other logins are not banned', (await db.query(`select count(*)::int n from auth.users where banned_until is not null and id <> $1`, [ownerB])).rows[0].n, 0);
eq('running the sweep again changes nothing', (await rowsAs('service_role', null, `select expire_demo_accounts() as n`))[0].n, 0);

await rows(adminA, `select admin_set_demo_expiry($1, 14)`, [ownerB]);
eq('extending a demo lifts the ban', (await db.query(`select banned_until from auth.users where id = $1`, [ownerB])).rows[0].banned_until, null);
await rows(adminA, `select admin_set_demo_expiry($1, null)`, [ownerB]);
eq('full access clears the demo date', (await db.query(`select demo_expires_at from users where id = $1`, [ownerB])).rows[0].demo_expires_at, null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
