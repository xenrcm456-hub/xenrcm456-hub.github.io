// Velvet API — Cloudflare Pages Function
// Routes: /api/*

const PBKDF2_ITERATIONS = 100000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function uid() {
  return crypto.randomUUID();
}

function b64url(bytes) {
  const str = typeof bytes === 'string'
    ? btoa(bytes)
    : btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return `${b64url(salt)}.${b64url(bits)}`;
}

async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split('.');
  if (!saltB64 || !hashB64) return false;
  const salt = Uint8Array.from(fromB64url(saltB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return b64url(bits) === hashB64;
}

async function signToken(payload, secret, ttlSeconds = 604800) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  }));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    Uint8Array.from(fromB64url(sig), c => c.charCodeAt(0)),
    new TextEncoder().encode(`${header}.${body}`)
  );
  if (!valid) return null;
  const payload = JSON.parse(fromB64url(body));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function getBearer(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 16; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `VELVET-${suffix}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonthFirst() {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    hwid: row.hwid,
    hwidResetsUsed: row.hwid_resets_used || 0,
    key: row.license_key,
    expires: row.license_expires,
    status: row.status,
    createdAt: row.created_at
  };
}

async function requireUser(request, env) {
  const token = getBearer(request);
  if (!token) return null;
  const secret = env.JWT_SECRET;
  if (!secret) return null;
  const payload = await verifyToken(token, secret);
  if (!payload || payload.type !== 'user') return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user || user.status === 'banned') return null;
  return user;
}

async function requireAdmin(request, env) {
  const token = getBearer(request);
  if (!token) return null;
  const secret = env.JWT_SECRET;
  if (!secret) return null;
  const payload = await verifyToken(token, secret);
  if (!payload || payload.type !== 'admin') return null;
  return await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(payload.sub).first();
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const rawPath = params.path;
  const pathStr = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath || '');
  const pathParts = pathStr.split('/').filter(Boolean);
  const route = pathParts.join('/');

  try {
    if (!env.DB) return error('Database not configured', 503);
    if (!env.JWT_SECRET) return error('Server not configured', 503);
    // ── Public auth routes ──
    if (method === 'POST' && route === 'auth/register') {
      const { username, password, key, hwid } = await request.json();
      if (!username || !password || !key) return error('Username, password, and license key required');
      if (username.length < 3) return error('Username must be at least 3 characters');
      if (password.length < 6) return error('Password must be at least 6 characters');

      const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existing) return error('Username already exists', 409);

      const license = await env.DB.prepare(
        'SELECT * FROM license_keys WHERE key_value = ? COLLATE NOCASE'
      ).bind(key.trim()).first();
      if (!license) return error('Invalid license key', 404);
      if (license.status === 'revoked') return error('This key has been revoked', 403);
      if (license.redeemed_by) return error('This key has already been redeemed', 403);
      if (license.expires !== 'lifetime' && new Date(license.expires) < new Date()) {
        return error('This key has expired', 403);
      }

      const userHwid = hwid || `HWID-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const banned = await env.DB.prepare('SELECT id FROM hwid_blacklist WHERE hwid = ?').bind(userHwid).first();
      if (banned) return error('Your HWID is blacklisted', 403);

      if (license.locked_hwid && license.locked_hwid !== userHwid) {
        return error('This key is locked to a different HWID', 403);
      }

      const id = uid();
      const hash = await hashPassword(password);
      const now = new Date().toISOString();

      await env.DB.prepare(
        'INSERT INTO users (id, username, email, password_hash, hwid, license_key, license_expires, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, username, `${username}@velvet.local`, hash, userHwid, license.key_value, license.expires, 'active', now).run();

      await env.DB.prepare(
        'UPDATE license_keys SET locked_hwid = ?, redeemed_by = ? WHERE id = ?'
      ).bind(userHwid, id, license.id).run();

      const token = await signToken({ sub: id, type: 'user' }, env.JWT_SECRET);
      return json({
        token,
        user: {
          id,
          username,
          email: `${username}@velvet.local`,
          hwid: userHwid,
          key: license.key_value,
          expires: license.expires,
          hwidResetsUsed: 0,
          status: 'active'
        }
      }, 201);
    }

    if (method === 'POST' && route === 'auth/login') {
      const { username, password } = await request.json();
      if (!username || !password) return error('Username and password required');

      const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return error('Invalid username or password', 401);
      }
      if (user.status === 'banned') return error('Your account has been banned', 403);
      if (user.status === 'suspended') return error('Your account has been suspended', 403);

      const token = await signToken({ sub: user.id, type: 'user' }, env.JWT_SECRET);
      return json({ token, user: sanitizeUser(user) });
    }

    if (method === 'GET' && route === 'auth/me') {
      const user = await requireUser(request, env);
      if (!user) return error('Unauthorized', 401);
      return json({ user: sanitizeUser(user) });
    }

    // ── One-time admin bootstrap ──
    if (method === 'POST' && route === 'admin/bootstrap') {
      const { username, password, secret } = await request.json();
      if (!username || !password || !secret) return error('username, password, and secret required');
      if (secret !== env.BOOTSTRAP_SECRET) return error('Invalid bootstrap secret', 403);

      const count = await env.DB.prepare('SELECT COUNT(*) as c FROM admins').first();
      if (count.c > 0) return error('Admin already exists. Bootstrap disabled.', 403);

      const id = uid();
      const hash = await hashPassword(password);
      await env.DB.prepare(
        'INSERT INTO admins (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
      ).bind(id, username, hash, new Date().toISOString()).run();

      return json({ message: 'Admin account created. Delete BOOTSTRAP_SECRET after setup.' }, 201);
    }

    // ── Admin auth ──
    if (method === 'POST' && route === 'admin/login') {
      const { username, password } = await request.json();
      if (!username || !password) return error('Username and password required');

      const admin = await env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(username).first();
      if (!admin || !(await verifyPassword(password, admin.password_hash))) {
        return error('Invalid username or password', 401);
      }

      const token = await signToken({ sub: admin.id, type: 'admin' }, env.JWT_SECRET);
      return json({ token, admin: { id: admin.id, username: admin.username } });
    }

    if (method === 'GET' && route === 'admin/me') {
      const admin = await requireAdmin(request, env);
      if (!admin) return error('Unauthorized', 401);
      return json({ admin: { id: admin.id, username: admin.username } });
    }

    // ── User: redeem key ──
    if (method === 'POST' && route === 'keys/redeem') {
      const user = await requireUser(request, env);
      if (!user) return error('Unauthorized', 401);

      const { key, hwid } = await request.json();
      if (!key) return error('License key required');

      const license = await env.DB.prepare(
        'SELECT * FROM license_keys WHERE key_value = ? COLLATE NOCASE'
      ).bind(key.trim()).first();
      if (!license) return error('Invalid license key', 404);
      if (license.status === 'revoked') return error('This key has been revoked', 403);
      if (license.expires !== 'lifetime' && new Date(license.expires) < new Date()) {
        return error('This key has expired', 403);
      }

      const userHwid = hwid || user.hwid;
      if (!userHwid) return error('HWID required');

      const banned = await env.DB.prepare('SELECT id FROM hwid_blacklist WHERE hwid = ?').bind(userHwid).first();
      if (banned) return error('Your HWID is blacklisted', 403);

      if (license.locked_hwid && license.locked_hwid !== userHwid) {
        return error('This key is locked to a different HWID', 403);
      }

      if (!license.locked_hwid) {
        await env.DB.prepare('UPDATE license_keys SET locked_hwid = ?, redeemed_by = ? WHERE id = ?')
          .bind(userHwid, user.id, license.id).run();
      }

      await env.DB.prepare(
        'UPDATE users SET license_key = ?, license_expires = ?, hwid = ? WHERE id = ?'
      ).bind(license.key_value, license.expires, userHwid, user.id).run();

      const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
      return json({ user: sanitizeUser(updated), message: 'Key redeemed successfully' });
    }

    // ── User: HWID reset ──
    if (method === 'POST' && route === 'hwid/reset') {
      const user = await requireUser(request, env);
      if (!user) return error('Unauthorized', 401);

      const month = currentMonth();
      let resetsUsed = user.hwid_resets_used || 0;
      if (user.hwid_resets_month !== month) {
        resetsUsed = 0;
      }
      if (resetsUsed >= 3) {
        return error(`No HWID resets remaining. Resets renew on ${nextMonthFirst()}`, 403);
      }

      await env.DB.prepare(
        'UPDATE users SET hwid_resets_used = ?, hwid_resets_month = ?, hwid = NULL WHERE id = ?'
      ).bind(resetsUsed + 1, month, user.id).run();

      if (user.license_key) {
        await env.DB.prepare('UPDATE license_keys SET locked_hwid = NULL WHERE key_value = ?')
          .bind(user.license_key).run();
      }

      const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
      return json({ user: sanitizeUser(updated), message: 'HWID reset successfully' });
    }

    // ── Admin routes ──
    const admin = await requireAdmin(request, env);

    if (method === 'GET' && route === 'admin/stats') {
      if (!admin) return error('Unauthorized', 401);
      const users = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
      const keys = await env.DB.prepare("SELECT COUNT(*) as c FROM license_keys WHERE status = 'active'").first();
      const hwids = await env.DB.prepare('SELECT COUNT(*) as c FROM hwid_blacklist').first();
      return json({
        totalUsers: users.c,
        activeKeys: keys.c,
        bannedHwids: hwids.c
      });
    }

    if (method === 'GET' && route === 'admin/users') {
      if (!admin) return error('Unauthorized', 401);
      const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
      return json({ users: results.map(sanitizeUser) });
    }

    if (method === 'PUT' && route.startsWith('admin/users/')) {
      if (!admin) return error('Unauthorized', 401);
      const userId = pathParts[2];
      const body = await request.json();
      await env.DB.prepare(
        'UPDATE users SET username = ?, email = ?, hwid = ?, status = ? WHERE id = ?'
      ).bind(body.username, body.email, body.hwid || null, body.status || 'active', userId).run();
      const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
      return json({ user: sanitizeUser(updated) });
    }

    if (method === 'DELETE' && route.startsWith('admin/users/')) {
      if (!admin) return error('Unauthorized', 401);
      const userId = pathParts[2];
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
      return json({ message: 'User deleted' });
    }

    if (method === 'GET' && route === 'admin/keys') {
      if (!admin) return error('Unauthorized', 401);
      const { results } = await env.DB.prepare('SELECT * FROM license_keys ORDER BY created_at DESC').all();
      return json({
        keys: results.map(k => ({
          id: k.id,
          key: k.key_value,
          lockedHwid: k.locked_hwid,
          expires: k.expires,
          status: k.status,
          note: k.note,
          redeemedBy: k.redeemed_by,
          createdAt: k.created_at
        }))
      });
    }

    if (method === 'POST' && route === 'admin/keys') {
      if (!admin) return error('Unauthorized', 401);
      const { duration, note } = await request.json();
      const durationInput = String(duration || '').trim().toLowerCase();

      let expires;
      if (durationInput === 'lifetime') {
        expires = 'lifetime';
      } else {
        const days = parseInt(durationInput, 10);
        if (isNaN(days) || days <= 0) return error('Enter valid days or "lifetime"');
        expires = new Date(Date.now() + days * 86400000).toISOString();
      }

      const id = uid();
      const keyValue = generateLicenseKey();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO license_keys (id, key_value, expires, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, keyValue, expires, 'active', note || '', now).run();

      return json({
        key: { id, key: keyValue, expires, status: 'active', note: note || '', createdAt: now }
      }, 201);
    }

    if (method === 'DELETE' && route.startsWith('admin/keys/')) {
      if (!admin) return error('Unauthorized', 401);
      const keyId = pathParts[2];
      await env.DB.prepare('DELETE FROM license_keys WHERE id = ?').bind(keyId).run();
      return json({ message: 'Key deleted' });
    }

    if (method === 'POST' && route.startsWith('admin/keys/') && pathParts[3] === 'reset-hwid') {
      if (!admin) return error('Unauthorized', 401);
      const keyId = pathParts[2];
      await env.DB.prepare('UPDATE license_keys SET locked_hwid = NULL WHERE id = ?').bind(keyId).run();
      return json({ message: 'HWID lock reset' });
    }

    if (method === 'GET' && route === 'admin/hwids') {
      if (!admin) return error('Unauthorized', 401);
      const { results } = await env.DB.prepare('SELECT * FROM hwid_blacklist ORDER BY added_at DESC').all();
      return json({
        hwids: results.map(h => ({
          id: h.id,
          hwid: h.hwid,
          reason: h.reason,
          addedAt: h.added_at
        }))
      });
    }

    if (method === 'POST' && route === 'admin/hwids') {
      if (!admin) return error('Unauthorized', 401);
      const { hwid, reason } = await request.json();
      if (!hwid || !reason) return error('HWID and reason required');
      const id = uid();
      await env.DB.prepare(
        'INSERT INTO hwid_blacklist (id, hwid, reason, added_at) VALUES (?, ?, ?, ?)'
      ).bind(id, hwid, reason, new Date().toISOString()).run();
      return json({ id, hwid, reason }, 201);
    }

    if (method === 'DELETE' && route.startsWith('admin/hwids/')) {
      if (!admin) return error('Unauthorized', 401);
      const hwidId = pathParts[2];
      await env.DB.prepare('DELETE FROM hwid_blacklist WHERE id = ?').bind(hwidId).run();
      return json({ message: 'HWID removed' });
    }

    if (method === 'POST' && route === 'admin/hwids/reset-all') {
      if (!admin) return error('Unauthorized', 401);
      await env.DB.prepare('UPDATE license_keys SET locked_hwid = NULL').run();
      return json({ message: 'All HWID locks reset' });
    }

    return error('Not found', 404);
  } catch (err) {
    console.error(err);
    return error('Internal server error', 500);
  }
}
