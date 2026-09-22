import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import net from 'net';
import {spawn, type ChildProcess} from 'child_process';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Is anything already listening on the given port?
 * Used to avoid spawning a second backend when one is already running
 * (e.g. a manually started `npm run server`).
 */
function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, host);
  });
}

const BACKEND_PORT = process.env.PORT || '3001';

/**
 * ROOT-CAUSE FIX for the recurring auth connection errors:
 *
 * The Vite dev server previously outlived (or started without) the Express
 * backend. When the backend on :3001 is down, the proxy answers /api requests
 * with an empty HTTP 500 — which the frontend surfaced as connection errors.
 *
 * This plugin makes the Vite process own the backend lifecycle:
 *   - spawns `tsx server/index.ts` on startup (unless :3001 is already served
 *     or DISABLE_HMR=true, where the hosting platform manages the server)
 *   - kills it when Vite exits
 *   - reports unexpected backend exits instead of dying silently
 */
function founditBackendSupervisor(): Plugin {
  let backend: ChildProcess | null = null;

  const cleanup = () => {
    if (backend) {
      try {
        backend.kill('SIGTERM');
      } catch {
        // already dead
      }
      backend = null;
    }
  };

  return {
    name: 'foundit-backend-supervisor',
    configureServer() {
      if (process.env.DISABLE_HMR === 'true') {
        console.log('[VITE] DISABLE_HMR=true — backend lifecycle managed by the platform, not spawning.');
        return;
      }

      void isPortOpen(Number(BACKEND_PORT)).then((open) => {
        if (open) {
          console.log(`[VITE] Backend already listening on :${BACKEND_PORT} — not spawning a duplicate.`);
          return;
        }

        console.log(`[VITE] Spawning FoundIt backend on :${BACKEND_PORT}...`);
        backend = spawn('npx tsx server/index.ts', {
          cwd: __dirname,
          shell: true, // cross-platform (npx.cmd on Windows)
          env: {...process.env, PORT: BACKEND_PORT},
          stdio: 'pipe',
        });

        const prefix = (chunk: Buffer) =>
          chunk
            .toString()
            .split('\n')
            .filter(Boolean)
            .map((line) => `[API] ${line}`)
            .join('\n') + '\n';
        backend.stdout?.on('data', (d: Buffer) => process.stdout.write(prefix(d)));
        backend.stderr?.on('data', (d: Buffer) => process.stderr.write(prefix(d)));

        backend.on('exit', (code, signal) => {
          if (signal !== 'SIGTERM') {
            console.warn(`[API] Backend exited unexpectedly (code ${code}). Restart the dev server to recover.`);
          }
          backend = null;
        });

        process.on('exit', cleanup);
        process.on('SIGINT', () => {
          cleanup();
          process.exit(0);
        });
        process.on('SIGTERM', () => {
          cleanup();
          process.exit(0);
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const googleClientId = env.VITE_GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  const supabaseUrl = env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnonKey =
    env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  return {
    plugins: [react(), tailwindcss(), founditBackendSupervisor()],
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
      'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
