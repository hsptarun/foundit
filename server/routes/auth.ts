import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import db, { DbUser, logSecurityEvent } from '../db';
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  setSessionCookie,
  clearSessionCookie,
  verifyGoogleToken,
  generateSecureToken,
  hashToken,
  getGoogleClientId,
} from '../authUtils';

const router = Router();

// Rate limiting for auth endpoints (brute force protection)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

export const strictLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 failed logins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please wait 15 minutes before trying again.',
  },
});

// Helper to get client IP and User Agent
function getClientMeta(req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const ua = (req.headers['user-agent'] as string) || 'unknown';
  return { ip, ua };
}

// Authentication Middleware
export function requireAuth(req: Request, res: Response, next: () => void) {
  const token = req.cookies?.foundit_session;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = validateSession(token, req);
  if (!result) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  (req as any).user = result.user;
  (req as any).session = result.session;
  next();
}

// Optional Auth Middleware (attaches user if session valid)
export function optionalAuth(req: Request, res: Response, next: () => void) {
  const token = req.cookies?.foundit_session;
  if (token) {
    const result = validateSession(token, req);
    if (result) {
      (req as any).user = result.user;
      (req as any).session = result.session;
    }
  }
  next();
}

// --- CSRF Token Endpoint ---
router.get('/csrf', (req: Request, res: Response) => {
  let csrfToken = req.cookies?.foundit_csrf;
  if (!csrfToken) {
    csrfToken = crypto.randomBytes(24).toString('hex');
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('foundit_csrf', csrfToken, {
      httpOnly: false, // Accessible to JS so client can send in x-csrf-token header
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }
  res.json({ csrfToken });
});

// --- Public Auth Configuration (Google Client ID) ---
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    googleClientId: getGoogleClientId(),
  });
});

// --- Get Current Authenticated User ---
router.get('/me', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user as DbUser | undefined;
  if (!user) {
    return res.json({ user: null });
  }
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      authProvider: user.auth_provider,
      emailVerified: Boolean(user.email_verified),
      totpEnabled: Boolean(user.totp_enabled),
      createdAt: user.created_at,
    },
  });
});

// --- Sign Up (Email + Password) ---
router.post('/signup', authLimiter, async (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  try {
    const { email, password, name } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check existing user
    const existing = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail) as any;
    if (existing) {
      logSecurityEvent('SIGNUP_FAILED_EXISTING_EMAIL', null, ip, ua, { email: normalizedEmail });
      return res.status(409).json({
        error: 'An account with this email already exists. Please log in or use Google Sign-In.',
      });
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const now = Date.now();
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 50) : normalizedEmail.split('@')[0];

    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, auth_provider, email_verified, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'local', 0, 'user', ?, ?)
    `).run(userId, normalizedEmail, cleanName, passwordHash, now, now);

    // Create Email Verification Token
    const { rawToken: verifyToken, tokenHash: verifyHash } = generateSecureToken();
    const verifyExpiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
    db.prepare(`
      INSERT INTO verification_tokens (id, user_id, token_hash, type, expires_at, created_at)
      VALUES (?, ?, ?, 'email_verify', ?, ?)
    `).run(crypto.randomUUID(), userId, verifyHash, verifyExpiresAt, now);

    // Log verification link in dev console
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[EMAIL_VERIFICATION_DEV] Token for ${normalizedEmail}: ${verifyToken}\n`);
    }

    // Auto-login after signup
    const { rawToken: sessionToken, expiresAt } = createSession(userId, req);
    setSessionCookie(res, sessionToken, expiresAt);

    logSecurityEvent('SIGNUP', userId, ip, ua, { email: normalizedEmail });
    logSecurityEvent('LOGIN_SUCCESS', userId, ip, ua, { provider: 'local' });

    res.status(201).json({
      success: true,
      user: {
        id: userId,
        email: normalizedEmail,
        name: cleanName,
        role: 'user',
        authProvider: 'local',
        emailVerified: false,
        totpEnabled: false,
        createdAt: now,
      },
      verificationTokenDev: process.env.NODE_ENV !== 'production' ? verifyToken : undefined,
    });
  } catch (err) {
    console.error('[SIGNUP_ERROR]', err);
    res.status(500).json({ error: 'An unexpected error occurred during signup.' });
  }
});

// --- Login (Email + Password with optional MFA) ---
router.post('/login', strictLoginLimiter, async (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  try {
    const { email, password, totpCode } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail) as any;

    // Generic error to prevent enumeration
    if (!user || !user.password_hash) {
      logSecurityEvent('LOGIN_FAILED', null, ip, ua, { reason: 'User not found or no password' });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      logSecurityEvent('LOGIN_FAILED', user.id, ip, ua, { reason: 'Incorrect password' });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check if 2FA (TOTP) is enabled
    if (user.totp_enabled && user.totp_secret) {
      if (!totpCode) {
        return res.json({
          mfaRequired: true,
          message: 'Two-factor authentication code required.',
        });
      }

      const verifyResult = verifySync({ token: totpCode.trim(), secret: user.totp_secret });
      if (!verifyResult.valid) {
        logSecurityEvent('MFA_FAILED', user.id, ip, ua);
        return res.status(401).json({ error: 'Invalid 2FA authentication code.' });
      }
      logSecurityEvent('MFA_VERIFIED', user.id, ip, ua);
    }

    // Create session
    const { rawToken, expiresAt } = createSession(user.id, req);
    setSessionCookie(res, rawToken, expiresAt);

    logSecurityEvent('LOGIN_SUCCESS', user.id, ip, ua, { provider: 'local' });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authProvider: user.auth_provider,
        emailVerified: Boolean(user.email_verified),
        totpEnabled: Boolean(user.totp_enabled),
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('[LOGIN_ERROR]', err);
    res.status(500).json({ error: 'An unexpected error occurred during login.' });
  }
});

// --- Google Sign-In & Account Linking ---
router.post('/google', authLimiter, async (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  try {
    const { credential } = req.body;
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google ID token credential is required.' });
    }

    const payload = await verifyGoogleToken(credential);
    const { googleId, email, name, emailVerified } = payload;
    const now = Date.now();

    // Check if user exists by google_id
    let user = db.prepare(`SELECT * FROM users WHERE google_id = ?`).get(googleId) as any;

    if (user) {
      logSecurityEvent('GOOGLE_LOGIN', user.id, ip, ua);
    } else {
      // Check if user exists with the same email (Account Linking)
      const existingEmailUser = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;

      if (existingEmailUser) {
        // Link Google ID to existing local account
        db.prepare(`
          UPDATE users 
          SET google_id = ?, auth_provider = 'both', email_verified = 1, updated_at = ?
          WHERE id = ?
        `).run(googleId, now, existingEmailUser.id);

        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(existingEmailUser.id) as any;
        logSecurityEvent('GOOGLE_LINKED', user.id, ip, ua, { email });
      } else {
        // Create new Google user
        const newUserId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO users (id, email, name, auth_provider, google_id, email_verified, role, created_at, updated_at)
          VALUES (?, ?, ?, 'google', ?, ?, 'user', ?, ?)
        `).run(newUserId, email, name, googleId, emailVerified ? 1 : 0, now, now);

        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(newUserId) as any;
        logSecurityEvent('SIGNUP', user.id, ip, ua, { provider: 'google', email });
        logSecurityEvent('GOOGLE_LOGIN', user.id, ip, ua);
      }
    }

    // Create session
    const { rawToken, expiresAt } = createSession(user.id, req);
    setSessionCookie(res, rawToken, expiresAt);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authProvider: user.auth_provider,
        emailVerified: Boolean(user.email_verified),
        totpEnabled: Boolean(user.totp_enabled),
        createdAt: user.created_at,
      },
    });
  } catch (err: any) {
    console.error('[GOOGLE_AUTH_ERROR]', err?.message || err);
    res.status(401).json({
      error: 'Google authentication failed. Please verify your Google account or Client ID settings.',
    });
  }
});

// --- Logout ---
router.post('/logout', (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  const token = req.cookies?.foundit_session;
  if (token) {
    const sessionUser = validateSession(token);
    if (sessionUser) {
      logSecurityEvent('LOGOUT', sessionUser.user.id, ip, ua);
    }
    revokeSession(token);
  }
  clearSessionCookie(res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// --- Forgot Password ---
router.post('/forgot-password', authLimiter, (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  const { email } = req.body;

  // Generic message returned regardless to prevent email enumeration
  const genericResponse = {
    success: true,
    message: 'If an account exists for this email, you will receive password reset instructions.',
  };

  if (!email || typeof email !== 'string') {
    return res.json(genericResponse);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail) as any;

  if (user) {
    const { rawToken, tokenHash } = generateSecureToken();
    const now = Date.now();
    const expiresAt = now + 60 * 60 * 1000; // 1 hour

    // Invalidate old password reset tokens for this user
    db.prepare(`DELETE FROM verification_tokens WHERE user_id = ? AND type = 'password_reset'`).run(user.id);

    db.prepare(`
      INSERT INTO verification_tokens (id, user_id, token_hash, type, expires_at, created_at)
      VALUES (?, ?, ?, 'password_reset', ?, ?)
    `).run(crypto.randomUUID(), user.id, tokenHash, expiresAt, now);

    logSecurityEvent('PASSWORD_RESET_REQUESTED', user.id, ip, ua);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[PASSWORD_RESET_DEV] Token for ${normalizedEmail}: ${rawToken}\n`);
    }

    return res.json({
      ...genericResponse,
      devResetToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
    });
  }

  res.json(genericResponse);
});

// --- Reset Password ---
router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Valid reset token is required.' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const tokenHash = hashToken(token.trim());
    const now = Date.now();

    const record = db.prepare(`
      SELECT * FROM verification_tokens
      WHERE token_hash = ? AND type = 'password_reset' AND expires_at > ?
    `).get(tokenHash, now) as any;

    if (!record) {
      return res.status(400).json({ error: 'Password reset link is invalid or has expired.' });
    }

    const newHash = await hashPassword(newPassword);

    // Update password
    db.prepare(`
      UPDATE users SET password_hash = ?, auth_provider = CASE WHEN auth_provider = 'google' THEN 'both' ELSE auth_provider END, updated_at = ?
      WHERE id = ?
    `).run(newHash, now, record.user_id);

    // Remove used token
    db.prepare(`DELETE FROM verification_tokens WHERE id = ?`).run(record.id);

    // Security sensitive: revoke all existing sessions to force re-login
    revokeAllUserSessions(record.user_id);
    clearSessionCookie(res);

    logSecurityEvent('PASSWORD_RESET_COMPLETED', record.user_id, ip, ua);
    logSecurityEvent('SESSION_REVOKED', record.user_id, ip, ua, { reason: 'Password reset' });

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (err) {
    console.error('[RESET_PASSWORD_ERROR]', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// --- Verify Email ---
router.post('/verify-email', authLimiter, (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  const { token } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Verification token is required.' });
  }

  const tokenHash = hashToken(token.trim());
  const now = Date.now();

  const record = db.prepare(`
    SELECT * FROM verification_tokens
    WHERE token_hash = ? AND type = 'email_verify' AND expires_at > ?
  `).get(tokenHash, now) as any;

  if (!record) {
    return res.status(400).json({ error: 'Verification link is invalid or has expired.' });
  }

  db.prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`).run(now, record.user_id);
  db.prepare(`DELETE FROM verification_tokens WHERE id = ?`).run(record.id);

  logSecurityEvent('EMAIL_VERIFIED', record.user_id, ip, ua);

  res.json({ success: true, message: 'Email verified successfully!' });
});

// --- MFA 2FA: Setup TOTP ---
router.post('/mfa/setup', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as DbUser;
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'FoundIt', label: user.email, secret });
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({
      secret,
      qrCodeUrl,
    });
  } catch (err) {
    console.error('[MFA_SETUP_ERROR]', err);
    res.status(500).json({ error: 'Failed to generate 2FA setup details.' });
  }
});

// --- MFA 2FA: Verify & Enable TOTP ---
router.post('/mfa/verify', requireAuth, (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  const user = (req as any).user as DbUser;
  const { code, secret } = req.body;

  if (!code || !secret) {
    return res.status(400).json({ error: 'Code and secret are required.' });
  }

  const verifyResult = verifySync({ token: code.trim(), secret: secret.trim() });
  if (!verifyResult.valid) {
    return res.status(400).json({ error: 'Invalid verification code. Please check your authenticator app.' });
  }

  const now = Date.now();
  db.prepare(`
    UPDATE users SET totp_secret = ?, totp_enabled = 1, updated_at = ?
    WHERE id = ?
  `).run(secret.trim(), now, user.id);

  logSecurityEvent('MFA_ENABLED', user.id, ip, ua);

  res.json({ success: true, message: 'Two-factor authentication enabled successfully.' });
});

// --- MFA 2FA: Disable TOTP ---
router.post('/mfa/disable', requireAuth, async (req: Request, res: Response) => {
  const { ip, ua } = getClientMeta(req);
  const user = (req as any).user as DbUser;
  const { password, code } = req.body;

  const dbUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;

  if (dbUser.password_hash) {
    if (!password) {
      return res.status(400).json({ error: 'Current password required to disable 2FA.' });
    }
    const match = await verifyPassword(password, dbUser.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }
  } else if (code) {
    const verifyResult = verifySync({ token: code.trim(), secret: dbUser.totp_secret });
    if (!verifyResult.valid) {
      return res.status(401).json({ error: 'Invalid 2FA code.' });
    }
  }

  const now = Date.now();
  db.prepare(`UPDATE users SET totp_secret = NULL, totp_enabled = 0, updated_at = ? WHERE id = ?`).run(now, user.id);

  logSecurityEvent('MFA_DISABLED', user.id, ip, ua);

  res.json({ success: true, message: 'Two-factor authentication disabled.' });
});

export default router;
