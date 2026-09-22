import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  authProvider: 'local' | 'google' | 'both';
  emailVerified: boolean;
  totpEnabled: boolean;
  createdAt: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  csrfToken: string | null;
  login: (email: string, password: string, totpCode?: string) => Promise<{ success: boolean; mfaRequired?: boolean; error?: string }>;
  signup: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string; devToken?: string }>;
  googleAuth: (credential: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string; devResetToken?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  verifyEmail: (token: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  setupMfa: () => Promise<{ secret: string; qrCodeUrl: string } | null>;
  verifyMfa: (code: string, secret: string) => Promise<{ success: boolean; error?: string }>;
  disableMfa: (password?: string, code?: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Safe response handling
// ---------------------------------------------------------------------------

/**
 * Parse a JSON response body without ever throwing.
 *
 * ROOT CAUSE FIX: when the backend is unreachable, the Vite dev proxy replies
 * with an empty body (HTTP 500). Calling `res.json()` on an empty body throws
 * `SyntaxError: Unexpected end of JSON input`, which used to be displayed raw
 * in the auth modal. This helper returns `{}` for empty/non-JSON bodies while
 * preserving genuine server payloads (including error JSON), so real backend
 * error messages and HTTP statuses are never hidden.
 */
async function readJsonSafely(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** True when the request never reached the backend (network/proxy failure). */
function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError || (err as any)?.name === 'AbortError';
}

/** Friendly message for connection failures (never leaks parse errors). */
const CONNECTION_ERROR = 'Unable to connect to the authentication server. Please try again.';

/**
 * Pick the best error message for a non-OK response.
 * Preserves genuine server error messages; for empty/gateway-style 5xx
 * (e.g. the Vite proxy responding when the backend is down) surfaces the
 * HTTP status so connection problems are diagnosable instead of hidden.
 */
function errorMsgFrom(res: Response, data: any, fallback: string): string {
  if (data && typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }
  if (res.status >= 500) {
    return `${CONNECTION_ERROR} (HTTP ${res.status} with empty response — is the backend running on port 3001?)`;
  }
  return `${fallback} (HTTP ${res.status})`;
}

function errorMessageFor(err: unknown, fallback: string): string {
  if (isNetworkFailure(err)) {
    return `${CONNECTION_ERROR} (network error — is the backend running on port 3001?)`;
  }
  const msg = (err as any)?.message ? String((err as any).message) : fallback;
  // Defensive: never surface raw JSON parse errors to users.
  if (/JSON/i.test(msg) && /input|position|token/i.test(msg)) return CONNECTION_ERROR;
  return msg;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Fetch CSRF token for mutating requests
  const fetchCsrf = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/csrf', { credentials: 'include' });
      if (res.ok) {
        const data = await readJsonSafely(res);
        const token = data.csrfToken ?? null;
        if (token) setCsrfToken(token);
        return token;
      }
    } catch {
      // Backend unreachable — leave token null; mutating calls will surface
      // a connection error when actually invoked.
    }
    return null;
  }, []);

  // Fetch authenticated user profile
  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await readJsonSafely(res);
        setUser(data.user || null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchCsrf().then(() => refreshUser());
  }, [fetchCsrf, refreshUser]);

  const clearError = useCallback(() => setError(null), []);

  const getHeaders = async () => {
    let token = csrfToken;
    if (!token) {
      token = await fetchCsrf();
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['x-csrf-token'] = token;
    }
    return headers;
  };

  // Sign Up
  const signup = async (email: string, password: string, name?: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Signup failed');
        setError(errMsg);
        return { success: false, error: errMsg };
      }
      setUser(data.user);
      return { success: true, devToken: data.verificationTokenDev };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Network error during signup');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Login
  const login = async (email: string, password: string, totpCode?: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email, password, totpCode }),
      });
      const data = await readJsonSafely(res);

      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Login failed');
        setError(errMsg);
        return { success: false, error: errMsg };
      }

      if (data.mfaRequired) {
        return { success: false, mfaRequired: true };
      }

      setUser(data.user);
      return { success: true };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Network error during login');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Google Sign-In / Account Linking
  const googleAuth = async (credential: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ credential }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Google authentication failed');
        setError(errMsg);
        return { success: false, error: errMsg };
      }
      setUser(data.user);
      return { success: true };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Network error during Google Sign-In');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Logout
  const logout = async () => {
    try {
      const headers = await getHeaders();
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
    } catch {
      // ignore — logout is best-effort
    } finally {
      setUser(null);
    }
  };

  // Forgot Password
  const forgotPassword = async (email: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Failed to request password reset');
        setError(errMsg);
        return { success: false, error: errMsg };
      }
      return {
        success: true,
        message: data.message,
        devResetToken: data.devResetToken,
      };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Failed to request password reset');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Reset Password
  const resetPassword = async (token: string, newPassword: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Password reset failed');
        setError(errMsg);
        return { success: false, error: errMsg };
      }
      setUser(null); // sessions revoked
      return { success: true, message: data.message };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Failed to reset password');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Verify Email
  const verifyEmail = async (token: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Email verification failed');
        setError(errMsg);
        return { success: false, error: errMsg };
      }
      if (user) {
        setUser({ ...user, emailVerified: true });
      }
      return { success: true, message: data.message };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Failed to verify email');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Setup MFA
  const setupMfa = async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        const data = await readJsonSafely(res);
        if (data.secret && data.qrCodeUrl) return data;
      }
    } catch {
      // ignore — caller renders a loading/failure state
    }
    return null;
  };

  // Verify and Enable MFA
  const verifyMfa = async (code: string, secret: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ code, secret }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Failed to verify 2FA code');
        setError(errMsg);
        return { success: false, error: errMsg };
      }
      if (user) {
        setUser({ ...user, totpEnabled: true });
      }
      return { success: true };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Failed to verify 2FA');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Disable MFA
  const disableMfa = async (password?: string, code?: string) => {
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ password, code }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const errMsg = errorMsgFrom(res, data, 'Failed to disable 2FA');
        setError(errMsg);
        return { success: false, error: errMsg };
      }
      if (user) {
        setUser({ ...user, totpEnabled: false });
      }
      return { success: true };
    } catch (err: any) {
      const errMsg = errorMessageFor(err, 'Failed to disable 2FA');
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        csrfToken,
        login,
        signup,
        googleAuth,
        logout,
        refreshUser,
        forgotPassword,
        resetPassword,
        verifyEmail,
        setupMfa,
        verifyMfa,
        disableMfa,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
