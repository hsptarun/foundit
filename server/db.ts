import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Ensure data directory exists
const dbDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'foundit_auth.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema with constraints & indexes
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name TEXT,
    password_hash TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'local', -- 'local', 'google', 'both'
    google_id TEXT UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    type TEXT NOT NULL, -- 'email_verify', 'password_reset'
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_verification_tokens_hash ON verification_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_verification_tokens_user ON verification_tokens(user_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
`);

export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  auth_provider: 'local' | 'google' | 'both';
  google_id: string | null;
  email_verified: number;
  role: 'user' | 'admin';
  totp_secret: string | null;
  totp_enabled: number;
  created_at: number;
  updated_at: number;
}

export interface DbSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  last_active_at: number;
  ip_address: string | null;
  user_agent: string | null;
}

// Security Audit Logger - parameter-safe, non-sensitive logging
export function logSecurityEvent(
  eventType: string,
  userId: string | null,
  ipAddress: string | null,
  userAgent: string | null,
  details: Record<string, unknown> = {}
) {
  try {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    // Strip sensitive fields if any were passed accidentally
    const sanitizedDetails = { ...details };
    delete sanitizedDetails.password;
    delete sanitizedDetails.token;
    delete sanitizedDetails.secret;

    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, user_id, event_type, ip_address, user_agent, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      userId,
      eventType,
      ipAddress || 'unknown',
      userAgent ? userAgent.substring(0, 255) : 'unknown',
      JSON.stringify(sanitizedDetails),
      createdAt
    );
  } catch (err) {
    console.error('[AUDIT_LOG_ERROR]', err);
  }
}

export default db;
