// Starts a complete local Orvia backend and leaves it running:
//   Postgres 16 (:54322) + the real migrations  ->  PostgREST (:54331)
//   the real vapi-events edge function in Deno (:54341)
//   a gateway playing Supabase Auth/Realtime on :54321
// then writes e2e/.generated/env.json for building the app against it.
//
//   node harness.mjs          (Ctrl+C stops everything)
//
// Tools live outside the repo (default ../../../.e2e-tools, see README).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createGateway, hashPassword, signJwt } from './gateway.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TOOLS = process.env.ORVIA_E2E_TOOLS ?? resolve(here, '../../../.e2e-tools');
const PG_BIN = join(TOOLS, 'pg', 'pgsql', 'bin');
const PGDATA = join(TOOLS, 'pgdata');
const POSTGREST = join(TOOLS, 'postgrest', 'artifacts', 'postgrest-windows-x64', 'postgrest.exe');
const DENO = join(TOOLS, 'deno', 'deno.exe');
const MIGRATIONS = resolve(here, '../../supabase/migrations');
const FUNCTION = resolve(here, '../../supabase/functions/vapi-events/index.ts');

const PORTS = { pg: 54322, rest: 54331, fn: 54341, gateway: 54321 };
const JWT_SECRET = 'orvia-e2e-secret-orvia-e2e-secret-0123456789';
const VAPI_SECRET = 'orvia-e2e-vapi-secret';
const PG_URL = `postgres://postgres@127.0.0.1:${PORTS.pg}/orvia`;

export const USERS = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'owner@smile.test', password: 'Correct-horse-1' },
  { id: '22222222-2222-4222-8222-222222222222', email: 'temp@smile.test', password: 'Temp-pass-123' },
  { id: '33333333-3333-4333-8333-333333333333', email: 'orphan@x.test', password: 'Orphan-pass-123' },
  { id: '44444444-4444-4444-8444-444444444444', email: 'owner@rival.test', password: 'Rival-pass-123' },
];

const children = [];
const log = (m) => console.log(`[harness] ${m}`);
const pgExe = (name, args, opts = {}) => execFileSync(join(PG_BIN, name), args, { stdio: 'pipe', ...opts });

function need(path, what) {
  if (!existsSync(path)) throw new Error(`${what} not found at ${path}. See e2e/README.md.`);
}

async function startPostgres() {
  need(PG_BIN, 'Postgres binaries');
  if (!existsSync(join(PGDATA, 'PG_VERSION'))) {
    log('initialising Postgres data directory');
    pgExe('initdb.exe', ['-D', PGDATA, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C']);
  }
  try {
    pgExe('pg_ctl.exe', ['-D', PGDATA, 'status']);
  } catch {
    log('starting Postgres');
    // stdio ignored: the postgres daemon inherits pipes, and waiting for them to close would hang forever.
    pgExe('pg_ctl.exe', ['-D', PGDATA, '-o', `-p ${PORTS.pg} -c listen_addresses=127.0.0.1`, '-l', join(TOOLS, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
  }
}

async function applySchema() {
  const admin = new pg.Client({ connectionString: `postgres://postgres@127.0.0.1:${PORTS.pg}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS orvia WITH (FORCE)');
  await admin.query('CREATE DATABASE orvia');
  await admin.end();

  const db = new pg.Client({ connectionString: PG_URL });
  await db.connect();
  await db.query(readFileSync(join(here, 'shim.sql'), 'utf8'));
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    let sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS pg_cron;/gi, '').replace(/^\s*SELECT\s+cron\.schedule\([^;]*\);/gim, '');
    await db.query(sql);
    // The live schema has users.theme_preference but no migration adds it.
    if (f.startsWith('001')) await db.query('ALTER TABLE users ADD COLUMN theme_preference text');
  }
  await db.query(readFileSync(join(here, 'notify.sql'), 'utf8'));
  await db.end();
  log('migrations applied');
}

async function seed() {
  const db = new pg.Client({ connectionString: PG_URL });
  await db.connect();
  await db.query('DELETE FROM auth.users');
  for (const u of USERS) {
    await db.query('INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, $2, $3)', [u.id, u.email, hashPassword(u.password)]);
  }
  await db.query(readFileSync(join(here, 'seed.sql'), 'utf8'));
  await db.end();
}

function spawnTool(name, cmd, args, env = {}) {
  const outFile = join(TOOLS, `${name}.log`);
  const out = openLog(outFile);
  const child = spawn(cmd, args, { stdio: ['ignore', out, out], env: { ...process.env, ...env }, windowsHide: true });
  child.on('exit', (code) => log(`${name} exited (${code})`));
  children.push(child);
  return child;
}

import { openSync } from 'node:fs';
const openLog = (p) => openSync(p, 'w');

async function waitFor(url, what, ok = (r) => r.status < 500) {
  for (let i = 0; i < 80; i++) {
    try {
      if (ok(await fetch(url))) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${what} did not come up at ${url}`);
}

async function main() {
  need(POSTGREST, 'PostgREST');
  need(DENO, 'Deno');
  await startPostgres();
  await applySchema();
  await seed();

  const mint = (role) => signJwt({ role, iss: 'e2e', iat: Math.floor(Date.now() / 1000), exp: 4102444800 }, JWT_SECRET);
  const anonKey = mint('anon');
  const serviceKey = mint('service_role');

  writeFileSync(
    join(TOOLS, 'postgrest.conf'),
    [
      `db-uri = "postgres://authenticator:authpw@127.0.0.1:${PORTS.pg}/orvia"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${JWT_SECRET}"`,
      'server-host = "127.0.0.1"',
      `server-port = ${PORTS.rest}`,
      'db-pool = 5',
    ].join('\n'),
  );
  // PostgREST on Windows loads libpq.dll from the Postgres bin directory.
  spawnTool('postgrest', POSTGREST, [join(TOOLS, 'postgrest.conf')], { PATH: `${PG_BIN};${process.env.PATH}` });
  await waitFor(`http://127.0.0.1:${PORTS.rest}/`, 'PostgREST');

  const gateway = await createGateway({
    port: PORTS.gateway,
    pgUrl: PG_URL,
    postgrestPort: PORTS.rest,
    functionPort: PORTS.fn,
    jwtSecret: JWT_SECRET,
    vapiSecret: VAPI_SECRET,
    reseed: seed,
  });

  // The real edge function. It reads Supabase through the gateway, exactly as
  // it reads the real project through its public URL.
  spawnTool('vapi-events', DENO, ['run', '--allow-net', '--allow-env', '--allow-read', '--no-prompt', FUNCTION], {
    DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${PORTS.fn}`,
    SUPABASE_URL: `http://127.0.0.1:${PORTS.gateway}`,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    VAPI_WEBHOOK_SECRET: VAPI_SECRET,
  });
  await waitFor(`http://127.0.0.1:${PORTS.fn}/`, 'vapi-events', () => true);

  mkdirSync(join(here, '.generated'), { recursive: true });
  const forPhone = { SUPABASE_URL: `http://127.0.0.1:${PORTS.gateway}`, SUPABASE_ANON_KEY: anonKey, ALLOW_INSECURE_LOCAL: true, E2E_NO_APP_LOCK: true };
  writeFileSync(join(here, '.generated', 'env.json'), JSON.stringify(forPhone, null, 2));
  writeFileSync(join(here, '.generated', 'env.emulator.json'), JSON.stringify({ ...forPhone, SUPABASE_URL: `http://10.0.2.2:${PORTS.gateway}` }, null, 2));
  writeFileSync(join(here, '.generated', 'ready'), String(Date.now()));

  log(`ready. gateway http://127.0.0.1:${PORTS.gateway}`);
  log('phone: adb reverse tcp:54321 tcp:54321, then build with e2e/.generated/env.json');

  const stop = async () => {
    log('stopping');
    await gateway.close();
    for (const c of children) c.kill();
    try {
      pgExe('pg_ctl.exe', ['-D', PGDATA, '-m', 'fast', 'stop']);
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  for (const c of children) c.kill();
  process.exit(1);
});
