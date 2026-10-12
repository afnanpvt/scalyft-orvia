// A stand-in for the parts of Supabase that are not Postgres:
//   /auth/v1      GoTrue's password, refresh, user, recover and logout endpoints
//   /rest/v1      proxied to a real PostgREST (so row-level security is real)
//   /functions/v1 proxied to the real vapi-events function running in Deno
//   /realtime/v1  a minimal Phoenix server that turns Postgres NOTIFYs into
//                 postgres_changes events
//   /__e2e/*      helpers for tests: reseed, post a Vapi event, run SQL
// Test infrastructure only. It is bound to loopback and has no real security.
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import { WebSocketServer } from 'ws';

// ── tokens and passwords ─────────────────────────────────────────────────────
const b64u = (b) => Buffer.from(b).toString('base64url');

export function signJwt(payload, secret) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [kind, saltHex, keyHex] = String(stored ?? '').split('$');
  if (kind !== 'scrypt') return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(keyHex, 'hex');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

// ── http helpers ─────────────────────────────────────────────────────────────
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function send(res, status, body, headers = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(text);
}

const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

function proxy(req, res, port, from) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port,
      method: req.method,
      path: req.url.replace(from, '') || '/',
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  // If the upstream dies after the response has started, headers are already
  // out: cut the connection instead of throwing and taking the gateway down.
  upstream.on('error', () => (res.headersSent ? res.destroy() : send(res, 502, { message: 'upstream unavailable' })));
  req.pipe(upstream);
}

// ── gateway ──────────────────────────────────────────────────────────────────
export async function createGateway({ port, pgUrl, postgrestPort, functionPort, jwtSecret, vapiSecret, reseed }) {
  const db = new pg.Pool({ connectionString: pgUrl, max: 4 });
  const refreshTokens = new Map(); // token -> user id
  const recoveries = [];

  const now = () => Math.floor(Date.now() / 1000);

  function userJson(u) {
    const created = new Date(u.created_at).toISOString();
    return {
      id: u.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: u.email,
      email_confirmed_at: created,
      phone: '',
      confirmed_at: created,
      last_sign_in_at: u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString() : null,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: created,
      updated_at: created,
    };
  }

  function sessionFor(u) {
    const exp = now() + 3600;
    const access = signJwt(
      {
        aud: 'authenticated', role: 'authenticated', sub: u.id, email: u.email,
        iat: now(), exp, iss: 'e2e-gateway', session_id: crypto.randomUUID(),
      },
      jwtSecret,
    );
    const refresh = crypto.randomBytes(12).toString('hex');
    refreshTokens.set(refresh, u.id);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: userJson(u) };
  }

  const userById = async (id) => (await db.query('select * from auth.users where id = $1', [id])).rows[0];
  const bearerUser = async (req) => {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const claims = verifyJwt(token, jwtSecret);
    return claims?.sub ? userById(claims.sub) : null;
  };

  // ── GoTrue ──
  async function auth(req, res, url) {
    const path = url.pathname.replace('/auth/v1', '');

    if (req.method === 'POST' && path === '/token') {
      const grant = url.searchParams.get('grant_type');
      const body = await readJson(req);
      if (grant === 'password') {
        const u = (await db.query('select * from auth.users where lower(email) = lower($1)', [body.email ?? ''])).rows[0];
        if (!u || !verifyPassword(body.password ?? '', u.encrypted_password)) {
          return authError(res, 400, 'invalid_credentials', 'Invalid login credentials');
        }
        await db.query('update auth.users set last_sign_in_at = now() where id = $1', [u.id]);
        return send(res, 200, sessionFor(u));
      }
      if (grant === 'refresh_token') {
        const id = refreshTokens.get(body.refresh_token);
        if (!id) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        refreshTokens.delete(body.refresh_token); // rotate
        const u = await userById(id);
        return u ? send(res, 200, sessionFor(u)) : authError(res, 400, 'user_not_found', 'User not found');
      }
      return authError(res, 400, 'unsupported_grant_type', 'unsupported grant type');
    }

    if (path === '/user') {
      const u = await bearerUser(req);
      if (!u) return authError(res, 401, 'bad_jwt', 'invalid JWT');
      if (req.method === 'GET') return send(res, 200, userJson(u));
      if (req.method === 'PUT') {
        const body = await readJson(req);
        if (typeof body.password === 'string') {
          if (body.password.length < 6) return authError(res, 422, 'weak_password', 'Password should be at least 6 characters.');
          if (verifyPassword(body.password, u.encrypted_password)) {
            return authError(res, 422, 'same_password', 'New password should be different from the old password.');
          }
          await db.query('update auth.users set encrypted_password = $1 where id = $2', [hashPasswordFn(body.password), u.id]);
        }
        return send(res, 200, userJson(await userById(u.id)));
      }
    }

    if (req.method === 'POST' && path === '/logout') {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === 'POST' && path === '/recover') {
      const body = await readJson(req);
      recoveries.push(String(body.email ?? ''));
      return send(res, 200, {});
    }

    return authError(res, 404, 'not_found', `no auth route ${req.method} ${path}`);
  }
  const hashPasswordFn = hashPassword;

  // ── Vapi helper ──
  async function postVapi(message) {
    const r = await fetch(`http://127.0.0.1:${functionPort}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vapi-secret': vapiSecret },
      body: JSON.stringify({ message }),
    });
    return { status: r.status, body: await r.text() };
  }

  async function e2e(req, res, url) {
    const path = url.pathname.replace('/__e2e', '');
    const body = req.method === 'POST' ? await readJson(req) : {};

    if (path === '/reseed') {
      await reseed();
      return send(res, 200, { ok: true });
    }
    if (path === '/state') return send(res, 200, { recoveries });
    if (path === '/query') {
      const r = await db.query(String(body.sql), body.params ?? []);
      return send(res, 200, { rows: r.rows });
    }
    if (path === '/vapi') {
      // A real phone call, as Vapi reports it: start, then end-of-call-report.
      const callId = body.callId ?? `e2e-${crypto.randomUUID()}`;
      const call = {
        id: callId,
        phoneNumberId: body.phoneNumberId ?? 'vapi-phone-1',
        customer: body.caller === null ? {} : { number: body.caller ?? '+919811112222' },
        startedAt: new Date(Date.now() - (body.durationSeconds ?? 60) * 1000).toISOString(),
        endedAt: new Date().toISOString(),
      };
      const out = {};
      if (body.kind === 'missed') {
        out.missed = await postVapi({ type: 'status-update', status: 'ended', call: { ...call, endedReason: 'customer-did-not-answer' } });
        return send(res, 200, { callId, ...out });
      }
      out.start = await postVapi({ type: 'call-start', call });
      if (body.waitMs) await new Promise((r) => setTimeout(r, body.waitMs));
      if (body.kind !== 'start-only') {
        out.end = await postVapi({
          type: 'end-of-call-report',
          call,
          transcript: body.transcript ?? 'AI: Thanks for calling Smile Dental.\nUser: Hi, I need to book a cleaning.\nAI: Sure, tomorrow at 10 works.',
          summary: body.summary ?? 'Caller wanted to book a cleaning.',
          durationSeconds: body.durationSeconds ?? 60,
          cost: 0.12,
          recordingUrl: body.recordingUrl,
          extractedVariables: body.vars ?? {},
        });
      }
      return send(res, 200, { callId, ...out });
    }
    return send(res, 404, { message: 'unknown e2e route' });
  }

  // ── realtime ──
  const sockets = new Set();
  const listener = new pg.Client({ connectionString: pgUrl });
  await listener.connect();
  await listener.query('LISTEN e2e_changes');
  listener.on('notification', (msg) => {
    let change;
    try {
      change = JSON.parse(msg.payload);
    } catch {
      return;
    }
    for (const ws of sockets) {
      for (const [topic, sub] of ws.subs) {
        const ids = sub.bindings
          .filter((b) => b.table === change.table && (b.event === '*' || b.event === change.type))
          .map((b) => b.id);
        if (!ids.length) continue;
        out(ws, sub.joinRef, null, topic, 'postgres_changes', {
          ids,
          data: {
            schema: 'public', table: change.table, commit_timestamp: new Date().toISOString(),
            type: change.type, columns: [], record: { id: change.id }, old_record: {}, errors: null,
          },
        });
      }
    }
  });

  const out = (ws, joinRef, ref, topic, event, payload) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(ws.vsn === '1.0.0'
      ? JSON.stringify({ join_ref: joinRef, ref, topic, event, payload })
      : JSON.stringify([joinRef, ref, topic, event, payload]));
  };

  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws, req) => {
    ws.vsn = new URL(req.url, 'http://x').searchParams.get('vsn') ?? '1.0.0';
    ws.subs = new Map();
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    ws.on('message', (raw) => {
      let m;
      try {
        const d = JSON.parse(raw.toString());
        m = Array.isArray(d) ? { joinRef: d[0], ref: d[1], topic: d[2], event: d[3], payload: d[4] } : { joinRef: d.join_ref, ref: d.ref, topic: d.topic, event: d.event, payload: d.payload };
      } catch {
        return;
      }
      const ok = (response = {}) => out(ws, m.joinRef, m.ref, m.topic, 'phx_reply', { status: 'ok', response });
      if (m.event === 'heartbeat') return out(ws, null, m.ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} });
      if (m.event === 'phx_join') {
        const wanted = m.payload?.config?.postgres_changes ?? [];
        const bindings = wanted.map((f, i) => ({ id: i + 1, event: f.event, schema: f.schema, table: f.table, filter: f.filter }));
        ws.subs.set(m.topic, { joinRef: m.joinRef, bindings });
        ok({ postgres_changes: bindings.map((b) => ({ id: b.id, event: b.event, schema: b.schema, table: b.table, ...(b.filter ? { filter: b.filter } : {}) })) });
        return out(ws, m.joinRef, null, m.topic, 'system', {
          message: 'Subscribed to PostgreSQL', status: 'ok', extension: 'postgres_changes', channel: m.topic.replace('realtime:', ''),
        });
      }
      if (m.event === 'phx_leave') {
        ws.subs.delete(m.topic);
        return ok();
      }
      return ok(); // access_token, presence, broadcast: acknowledged, ignored
    });
  });

  // ── routing ──
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url);
      if (url.pathname.startsWith('/rest/v1')) return proxy(req, res, postgrestPort, '/rest/v1');
      if (url.pathname.startsWith('/functions/v1')) return proxy(req, res, functionPort, /^\/functions\/v1\/[^/?]+/);
      if (url.pathname.startsWith('/__e2e')) return await e2e(req, res, url);
      return send(res, 404, { message: 'not found' });
    } catch (e) {
      console.error('gateway error', e);
      return send(res, 500, { message: String(e) });
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/realtime/v1/websocket')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  await new Promise((r) => server.listen(port, '127.0.0.1', r));

  return {
    port,
    async close() {
      for (const ws of sockets) ws.terminate();
      wss.close();
      server.close();
      await listener.end().catch(() => {});
      await db.end().catch(() => {});
    },
  };
}
