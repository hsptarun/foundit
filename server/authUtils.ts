import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import db, { DbSession, DbUser, logSecurityEvent } from './db';
import { Request, Response } from 'express';

import dotenv from 'dotenv';
dotenv.config();

const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getGoogleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
}

function getGoogleClient(): OAuth2Client {
  return new OAuth2Client(getGoogleClientId());
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateSecureToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

// Session Management
export function createSession(userId: string, req: Request): { rawToken: string; expiresAt: number } {
  const { rawToken, tokenHash } = generateSecureToken();
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MS;
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_active_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(sessionId, userId, tokenHash, expiresAt, now, now, ip, userAgent);

  return { rawToken, expiresAt };
}

export function validateSession(rawToken: string, req?: Request): { session: DbSession; user: DbUser } | null {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = hashToken(rawToken);
  const now = Date.now();

  const stmt = db.prepare(`
    SELECT s.*, u.id as user_id, u.email, u.name, u.auth_provider, u.google_id, 
           u.email_verified, u.role, u.totp_enabled, u.created_at as user_created_at, u.updated_at as user_updated_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `);

  const row = stmt.get(tokenHash, now) as any;
  if (!row) return null;

  // Optional: Update last_active_at (throttled to at most once per 15 minutes to reduce writes)
  if (now - row.last_active_at > 15 * 60 * 1000) {
    db.prepare(`UPDATE sessions SET last_active_at = ? WHERE id = ?`).run(now, row.id);
  }

  const session: DbSession = {
    id: row.id,
    user_id: row.user_id,
    token_hash: row.token_hash,
    expires_at: row.expires_at,
    created_at: row.created_at,
    last_active_at: row.last_active_at,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
  };

  const user: DbUser = {
    id: row.user_id,
    email: row.email,
    name: row.name,
    password_hash: null, // never expose hash in memory
    auth_provider: row.auth_provider,
    google_id: row.google_id,
    email_verified: row.email_verified,
    role: row.role,
    totp_secret: null,
    totp_enabled: row.totp_enabled,
    created_at: row.user_created_at,
    updated_at: row.user_updated_at,
  };

  return { session, user };
}

export function revokeSession(rawToken: string): void {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function revokeAllUserSessions(userId: string): void {
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}

// Google ID Token Validation
export async function verifyGoogleToken(idToken: string): Promise<{
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured in server environment.');
  }

  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google ID token payload.');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
    emailVerified: Boolean(payload.email_verified),
  };
}

// Cookie Helper
export function setSessionCookie(res: Response, token: string, expiresAt: number) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('foundit_session', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('foundit_session', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}
