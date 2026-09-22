/**
 * Phase 2A verification — 1 image / hour / user (server-side).
 *
 * Run with the server NOT yet started; the script boots its own instance.
 *   npx tsx scripts/testUploadLimits.ts
 *
 * Uses only existing endpoints (signup/login/csrf/uploads) — no auth changes.
 * Cleans up all test artifacts (SQLite rows + Supabase objects) afterwards.
 * Never prints secrets.
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'foundit_auth.db');
const BUCKET = 'item-images';

// 1x1 transparent PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Minimal cookie jar + fetch helper (mirrors the browser: csrf cookie + header)
// ---------------------------------------------------------------------------
type Jar = Map<string, string>;

function newJar(): Jar {
  return new Map();
}

function absorbSetCookies(jar: Jar, res: Response) {
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(
  jar: Jar,
  method: 'GET' | 'POST',
  pathname: string,
  body?: FormData | Record<string, unknown>
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  const csrf = jar.get('foundit_csrf');
  if (csrf) headers['x-csrf-token'] = csrf;
  const ck = cookieHeader(jar);
  if (ck) headers['Cookie'] = ck;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // fetch sets multipart boundary
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: payload,
  });
  absorbSetCookies(jar, res);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function pngForm(n = 1): FormData {
  const fd = new FormData();
  for (let i = 0; i < n; i++) {
    fd.append('images', new Blob([PNG_BYTES], { type: 'image/png' }), `t${i}.png`);
  }
  return fd;
}

// ---------------------------------------------------------------------------
// Supabase admin (cleanup + storage verification) — server-side only
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supabaseUrl || !serviceKey) {
  console.error('This test requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function storageCountFor(userId: string): Promise<number> {
  const { data, error } = await sb.storage.from(BUCKET).list(`items/${userId}`, { limit: 100 });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  return (data ?? []).filter((o) => o.name && !o.name.endsWith('/')).length;
}

async function storageCleanupFor(userId: string) {
  const { data } = await sb.storage.from(BUCKET).list(`items/${userId}`, { limit: 100 });
  const names = (data ?? []).map((o) => o.name).filter(Boolean);
  if (names.length) {
    await sb.storage.from(BUCKET).remove(names.map((n) => `items/${userId}/${n}`));
  }
}

// ---------------------------------------------------------------------------
// SQLite cleanup (test users only) — same db file the server uses (WAL ok)
// ---------------------------------------------------------------------------
function cleanupUsers(userIds: string[]) {
  if (!userIds.length) return;
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  const del = db.transaction((ids: string[]) => {
    const rm = (sql: string) => {
      const stmt = db.prepare(sql);
      for (const id of ids) stmt.run(id);
    };
    rm(`DELETE FROM image_upload_limits WHERE user_id = ?`);
    rm(`DELETE FROM audit_logs WHERE user_id = ?`);
    rm(`DELETE FROM sessions WHERE user_id = ?`);
    rm(`DELETE FROM users WHERE id = ?`);
  });
  del(userIds);
  db.close();
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
async function waitForServer(timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function signup(jar: Jar, email: string) {
  const { status, json } = await api(jar, 'POST', '/api/auth/signup', {
    email,
    password: 'TestPass!234',
    name: 'Phase2A Test',
  });
  if (status === 201 && json?.user?.id) return json.user.id as string;
  // Fallback: login (user may already exist from a crashed previous run)
  const login = await api(jar, 'POST', '/api/auth/login', {
    email,
    password: 'TestPass!234',
  });
  if (login.status === 200 && login.json?.user?.id) return login.json.user.id as string;
  throw new Error(`Could not create/login test user ${email}: signup=${status} login=${login.status}`);
}

// ===========================================================================
async function main() {
  console.log('Starting server for Phase 2A tests...');
  const serverProc = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  });

  try {
    if (!(await waitForServer())) {
      throw new Error('Server did not become healthy in time.');
    }
    console.log('Server is up.\n');

    const stamp = Date.now();
    const createdUserIds: string[] = [];

    // ---- fresh HTTP client (no cookies) → "cleared localStorage / new browser"
    const freshClient = () => newJar();

    // =============== TEST 4: unauthenticated upload → 401 ===============
    console.log('TEST 4: unauthenticated upload');
    {
      const jar = freshClient(); // no session at all
      const { status, json } = await api(jar, 'POST', '/api/uploads/item-images', pngForm(1));
      check('returns 401', status === 401, `got ${status}`);
      check('JSON error body', typeof json?.error === 'string' && json.error.length > 0);
    }

    // =============== TEST 5: two images in one request → 400 ===============
    console.log('TEST 5: two images in one request');
    {
      const jar = freshClient();
      const u1 = await signup(jar, `p2a-u1-${stamp}@example.com`);
      createdUserIds.push(u1);

      const { status, json } = await api(jar, 'POST', '/api/uploads/item-images', pngForm(2));
      check('returns 400', status === 400, `got ${status}`);
      check('clear JSON error', /one image/i.test(json?.error || ''), json?.error);
      const count = await storageCountFor(u1);
      check('neither image uploaded', count === 0, `storage objects: ${count}`);
    }

    // =============== TEST 1: one valid image → 201 ===============
    console.log('TEST 1: authenticated user uploads one valid image');
    {
      const jar = freshClient();
      await signup(jar, `p2a-u1-${stamp}@example.com`);
      const { status, json } = await api(jar, 'POST', '/api/uploads/item-images', pngForm(1));
      check('returns 201', status === 201, `got ${status}: ${JSON.stringify(json)}`);
      check('returns image ref', Boolean(json?.images?.[0]?.storage_path));
      const u1 = createdUserIds[0];
      const count = await storageCountFor(u1);
      check('exactly 1 object in Supabase Storage', count === 1, `storage objects: ${count}`);
    }

    // =============== TEST 2: immediate second upload → 429 ===============
    console.log('TEST 2: same user immediately uploads another image');
    {
      const jar = freshClient();
      await signup(jar, `p2a-u1-${stamp}@example.com`);
      const { status, json } = await api(jar, 'POST', '/api/uploads/item-images', pngForm(1));
      check('returns 429', status === 429, `got ${status}`);
      check(
        'safe message, no DB internals',
        json?.error ===
          'Image upload limit reached. You can upload another image after the 1-hour limit resets.',
        JSON.stringify(json)
      );
      const u1 = createdUserIds[0];
      const count = await storageCountFor(u1);
      check('no second file in Supabase Storage', count === 1, `storage objects: ${count}`);
    }

    // =============== TEST 3: fresh client (cleared storage) → still 429 ===============
    console.log('TEST 3: cleared localStorage / brand-new client, fresh login');
    {
      const jar = freshClient(); // simulates cleared browser storage
      await signup(jar, `p2a-u1-${stamp}@example.com`); // brand-new session, same user
      const { status, json } = await api(jar, 'POST', '/api/uploads/item-images', pngForm(1));
      check('still 429 (server-side enforcement)', status === 429, `got ${status}: ${JSON.stringify(json)}`);
      check('same safe message', /1-hour limit resets/.test(json?.error || ''));
    }

    // =============== TEST 6: two concurrent uploads, same user → 1 success ===============
    console.log('TEST 6: two concurrent uploads from the same user');
    {
      const jar = freshClient();
      const u2 = await signup(jar, `p2a-u2-${stamp}@example.com`);
      createdUserIds.push(u2);

      const [a, b] = await Promise.all([
        api(jar, 'POST', '/api/uploads/item-images', pngForm(1)),
        api(jar, 'POST', '/api/uploads/item-images', pngForm(1)),
      ]);
      const statuses = [a.status, b.status].sort();
      check('exactly one 201', statuses[0] === 201 && statuses[1] === 429, `got ${statuses.join(',')}`);
      const count = await storageCountFor(u2);
      check('only one object in Supabase Storage', count === 1, `storage objects: ${count}`);
    }

    // =============== TEST 7: another user is NOT blocked ===============
    console.log('TEST 7: another authenticated user uploads while others are limited');
    {
      const jar = freshClient();
      const u3 = await signup(jar, `p2a-u3-${stamp}@example.com`);
      createdUserIds.push(u3);

      const { status, json } = await api(jar, 'POST', '/api/uploads/item-images', pngForm(1));
      check('returns 201 (not blocked by other users)', status === 201, `got ${status}: ${JSON.stringify(json)}`);
      const count = await storageCountFor(u3);
      check('object stored for third user', count === 1, `storage objects: ${count}`);
    }

    // =============== UNIT: failed upload releases the claim (req. 6) ===============
    console.log('UNIT: failed upload releases claim (allowance not consumed)');
    {
      const { claimUploadSlot, releaseClaim, confirmUpload } = await import('../server/imageUploadLimits');
      const uid = `unit-${stamp}`;
      const first = claimUploadSlot(uid);
      check('first claim allowed', first.allowed === true);
      const second = claimUploadSlot(uid);
      check('second claim blocked while pending', second.allowed === false);
      releaseClaim(uid); // simulates a failed Supabase upload
      const third = claimUploadSlot(uid);
      check('claim allowed again after release', third.allowed === true);
      confirmUpload(uid);
      const fourth = claimUploadSlot(uid);
      check('blocked after confirmed success', fourth.allowed === false);
      // cleanup unit rows
      const db = new Database(DB_PATH);
      db.prepare(`DELETE FROM image_upload_limits WHERE user_id = ?`).run(uid);
      db.close();
    }

    // =============== CLEANUP ===============
    console.log('\nCleaning up test artifacts...');
    for (const uid of createdUserIds) {
      await storageCleanupFor(uid);
    }
    cleanupUsers(createdUserIds);
    console.log('Cleanup done.');

    console.log(`\n===== PHASE 2A TEST RESULTS: ${passed} passed, ${failed} failed =====`);
    process.exitCode = failed === 0 ? 0 : 1;
  } catch (err: any) {
    console.error('\n[FATAL]', err?.message || err);
    process.exitCode = 1;
  } finally {
    try {
      if (serverProc.pid) process.kill(-serverProc.pid);
    } catch {
      /* already gone */
    }
  }
}

main();
