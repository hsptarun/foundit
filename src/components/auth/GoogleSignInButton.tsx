import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle, Loader2 } from 'lucide-react';

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

declare global {
  interface Window {
    google?: any;
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  text = 'continue_with',
}) => {
  const { googleAuth } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGsiLoaded, setIsGsiLoaded] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 1. Resolve Google Client ID from Vite env OR backend /api/auth/config
  useEffect(() => {
    // Read directly as literal import.meta.env.VITE_GOOGLE_CLIENT_ID for Vite build-time replacement
    const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    if (envClientId) {
      setGoogleClientId(envClientId);
    } else {
      // Fallback: query backend config endpoint
      fetch('/api/auth/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.googleClientId) {
            setGoogleClientId(data.googleClientId);
          }
        })
        .catch(() => {
          // ignore
        });
    }

    // 2. Ensure Google Identity Services script is loaded
    if (window.google?.accounts?.id) {
      setIsGsiLoaded(true);
    } else {
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => setIsGsiLoaded(true);
        document.head.appendChild(script);
      } else {
        const interval = setInterval(() => {
          if (window.google?.accounts?.id) {
            setIsGsiLoaded(true);
            clearInterval(interval);
          }
        }, 100);
        return () => clearInterval(interval);
      }
    }
  }, []);

  // 3. Initialize Google Identity Services and render official button
  useEffect(() => {
    if (!isGsiLoaded || !googleClientId || !buttonRef.current) return;

    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          if (response.credential) {
            setIsLoading(true);
            setErrorMessage(null);
            const res = await googleAuth(response.credential);
            setIsLoading(false);
            if (res.success) {
              onSuccess?.();
            } else {
              setErrorMessage(res.error || 'Google sign-in failed.');
            }
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear any previous rendered children
      buttonRef.current.innerHTML = '';

      // Render official Google button
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: text,
        logo_alignment: 'left',
        width: 360,
      });
    } catch (err: any) {
      console.warn('Google Identity Services initialization warning:', err?.message || err);
    }
  }, [isGsiLoaded, googleClientId, text, googleAuth, onSuccess]);

  const handleFallbackClick = () => {
    if (!googleClientId) {
      setErrorMessage(
        'Google Client ID is not configured yet. Please set VITE_GOOGLE_CLIENT_ID in your .env file, or use Email & Password below.'
      );
      return;
    }

    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt();
      } catch (err) {
        console.warn('Google prompt error:', err);
      }
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {errorMessage && (
        <div className="w-full mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isLoading && (
        <div className="w-full mb-3 p-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-md flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#E8A33D]" />
          <span>Verifying Google account with server...</span>
        </div>
      )}

      {/* Render Google official button if configured and GSI ready */}
      <div
        ref={buttonRef}
        className={`w-full flex justify-center min-h-[44px] ${
          googleClientId && isGsiLoaded ? 'block' : 'hidden'
        }`}
      />

      {/* Fallback button when Google Client ID is loading or not yet provided */}
      {(!googleClientId || !isGsiLoaded) && (
        <button
          type="button"
          onClick={handleFallbackClick}
          className="w-full py-2.5 px-4 border border-[#1B1812]/20 rounded-md bg-white hover:bg-neutral-50 text-[#1B1812] text-sm font-medium transition-all shadow-xs flex items-center justify-center gap-3 cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>
      )}
    </div>
  );
};
