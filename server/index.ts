import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import itemsRouter from './routes/items';
import { logSecurityEvent } from './db';
import { isSupabaseConfigured, isSupabaseAdmin } from './supabase';
import { activeBackend, seedDemoItems } from './appData';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const appUrl = process.env.APP_URL || 'http://localhost:3000';

// Security: Trust proxy when behind reverse proxy / Cloud Run
app.set('trust proxy', 1);

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'", // Needed for Vite dev server HMR
          'https://accounts.google.com/gsi/client',
          'https://apis.google.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://images.unsplash.com',
          'https://lh3.googleusercontent.com', // Google profile photos
          'https://ai.google.dev',
          'https://*.supabase.co', // Supabase Storage item images
        ],
        frameSrc: [
          "'self'",
          'https://accounts.google.com/gsi/',
          'https://accounts.google.com/',
        ],
        connectSrc: [
          "'self'",
          'https://accounts.google.com/gsi/',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:3001',
          'https://*.supabase.co', // Supabase REST/Storage
          'wss://*.supabase.co',   // Supabase Realtime (future)
        ],
      },
    },
    crossOriginEmbedderPolicy: false, // Prevents breaking cross-origin Google scripts & Unsplash images
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Enables Google OAuth Popups
  })
);

// Security: Enforce JSON parsing size limits
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(cookieParser());

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  appUrl,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin in prod)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy: Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Additional security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CSRF Protection Middleware for Mutating State Requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (mutatingMethods.includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies?.foundit_csrf;

    // If CSRF cookie is present, ensure request header matches
    if (cookieToken && headerToken !== cookieToken) {
      logSecurityEvent(
        'CSRF_TOKEN_MISMATCH',
        null,
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
        req.headers['user-agent'] || 'unknown',
        { method: req.method, path: req.path }
      );
      return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    }
  }
  next();
});

// Auth Routes (SQLite-backed — unchanged)
app.use('/api/auth', authRouter);

// Upload Routes (Supabase Storage)
app.use('/api/uploads', uploadRouter);

// Item Report Routes (persistent items)
app.use('/api/items', itemsRouter);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    database: {
      sqliteAuth: 'connected', // existing auth DB (unchanged)
      appDataBackend: activeBackend(), // 'supabase' | 'dev-fallback'
      supabase: isSupabaseConfigured()
        ? isSupabaseAdmin()
          ? 'configured (service role)'
          : 'configured (anon key — limited)'
        : 'not-configured',
    },
  });
});

// Serve static production build if dist directory exists
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // API routes must NEVER fall through to the SPA — an HTML response to an
  // API call causes client-side JSON parse failures. Return JSON 404 for any
  // unmatched /api path, then serve the SPA for everything else.
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Same guarantee in dev/when dist is absent.
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });
}

// Centralized error handling: Never leak stack traces to client
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('[UNHANDLED_ERROR]', err?.stack || err);
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  logSecurityEvent('SERVER_ERROR', null, ip, req.headers['user-agent'] || 'unknown', {
    path: req.path,
    message: err?.message,
  });

  res.status(500).json({
    error: 'An internal server error occurred. Please try again later.',
  });
});

// Idempotent demo seeding (former INITIAL_ITEMS) — runs once per boot, skips
// items that already exist by fixed id. Dev-fallback backend only: with real
// Supabase credentials this also runs but only inserts missing seed rows.
seedDemoItems()
  .then(({ inserted, skipped }) => {
    if (inserted > 0) {
      console.log(`[FoundIt Server] Demo seed complete: ${inserted} inserted, ${skipped} already present (backend: ${activeBackend()}).`);
    }
  })
  .catch((err) => console.error('[FoundIt Server] Demo seed failed:', err?.message || err));

app.listen(PORT, () => {
  console.log(
    `[FoundIt Server] Secure backend listening on port ${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'}, app-data backend: ${activeBackend()})`
  );
});

export default app;
