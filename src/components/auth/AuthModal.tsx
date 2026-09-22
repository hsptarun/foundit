import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  QrCode,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GoogleSignInButton } from './GoogleSignInButton';

export type AuthModalMode = 'login' | 'signup' | 'mfa' | 'forgot' | 'reset' | 'mfa-settings';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: AuthModalMode;
  onClose: () => void;
  onSuccess?: () => void;
  resetTokenProp?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
  resetTokenProp,
}) => {
  const {
    user,
    login,
    signup,
    forgotPassword,
    resetPassword,
    setupMfa,
    verifyMfa,
    disableMfa,
    error,
    clearError,
  } = useAuth();

  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [resetToken, setResetToken] = useState(resetTokenProp || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [devTokenNotice, setDevTokenNotice] = useState<string | null>(null);

  // 2FA Setup State
  const [mfaData, setMfaData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      clearError();
      setLocalError(null);
      setSuccessNotice(null);
      setDevTokenNotice(null);
      if (resetTokenProp) {
        setResetToken(resetTokenProp);
        setMode('reset');
      }
    }
  }, [isOpen, initialMode, resetTokenProp, clearError]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load MFA data when entering mfa-settings mode
  useEffect(() => {
    if (mode === 'mfa-settings' && user && !user.totpEnabled && !mfaData) {
      setupMfa().then((data) => {
        if (data) setMfaData(data);
      });
    }
  }, [mode, user, mfaData, setupMfa]);

  if (!isOpen) return null;

  // Password strength calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score: 1, label: 'Weak (min 8 chars required)', color: 'bg-red-500' };
    if (score <= 3) return { score: 2, label: 'Fair (add numbers & symbols)', color: 'bg-amber-500' };
    if (score <= 4) return { score: 3, label: 'Good', color: 'bg-blue-500' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-600' };
  };

  const strength = getPasswordStrength(password || newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);
    setSuccessNotice(null);
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await login(email, password, totpCode);
        if (res.mfaRequired) {
          setMode('mfa');
          setIsSubmitting(false);
          return;
        }
        if (res.success) {
          onSuccess?.();
          onClose();
        }
      } else if (mode === 'signup') {
        if (password.length < 8) {
          setLocalError('Password must be at least 8 characters long.');
          setIsSubmitting(false);
          return;
        }
        const res = await signup(email, password, name);
        if (res.success) {
          if (res.devToken) {
            setDevTokenNotice(
              `Email verification token generated (Dev Mode): ${res.devToken}`
            );
          }
          onSuccess?.();
          onClose();
        }
      } else if (mode === 'mfa') {
        const res = await login(email, password, totpCode);
        if (res.success) {
          onSuccess?.();
          onClose();
        } else {
          setLocalError(res.error || 'Invalid 2FA code');
        }
      } else if (mode === 'forgot') {
        const res = await forgotPassword(email);
        setSuccessNotice(
          res.message || 'If an account exists for this email, you will receive reset instructions.'
        );
        if (res.devResetToken) {
          setDevTokenNotice(
            `Dev reset token: ${res.devResetToken}`
          );
        }
      } else if (mode === 'reset') {
        if (newPassword.length < 8) {
          setLocalError('Password must be at least 8 characters long.');
          setIsSubmitting(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setLocalError('Passwords do not match.');
          setIsSubmitting(false);
          return;
        }
        const res = await resetPassword(resetToken, newPassword);
        if (res.success) {
          setSuccessNotice(res.message || 'Password reset successfully. Please sign in.');
          setMode('login');
          setPassword('');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyMfaSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaData || !mfaVerifyCode) return;
    setIsSubmitting(true);
    setLocalError(null);
    const res = await verifyMfa(mfaVerifyCode, mfaData.secret);
    setIsSubmitting(false);
    if (res.success) {
      setSuccessNotice('Two-Factor Authentication is now enabled!');
      setMode('login');
    } else {
      setLocalError(res.error || 'Failed to verify code.');
    }
  };

  const handleDisableMfa = async () => {
    setIsSubmitting(true);
    setLocalError(null);
    const res = await disableMfa();
    setIsSubmitting(false);
    if (res.success) {
      setSuccessNotice('Two-Factor Authentication disabled.');
      onClose();
    } else {
      setLocalError(res.error || 'Failed to disable 2FA.');
    }
  };

  const handleCopySecret = () => {
    if (mfaData?.secret) {
      navigator.clipboard.writeText(mfaData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1812]/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      {/* Click outside backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#F6F3EC] rounded-xl shadow-2xl border border-[#1B1812]/15 p-6 sm:p-8 z-10 max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-[#1B1812]/60 hover:text-[#1B1812] hover:bg-[#1B1812]/5 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 mb-2">
            <span className="font-fraunces text-2xl font-[450] tracking-tight text-[#1B1812]">
              FoundIt
            </span>
            <span className="text-xl text-[#E8A33D]">.</span>
          </div>

          <h2 className="font-fraunces text-2xl sm:text-3xl font-[450] text-[#1B1812]">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Your Account'}
            {mode === 'mfa' && 'Two-Factor Check'}
            {mode === 'forgot' && 'Reset Password'}
            {mode === 'reset' && 'Create New Password'}
            {mode === 'mfa-settings' && '2FA Security'}
          </h2>

          <p className="text-xs sm:text-sm text-[#1B1812]/70 mt-1">
            {mode === 'login' && 'Sign in to manage your lost & found reports and claims'}
            {mode === 'signup' && 'Join FoundIt for verified lost & found matching'}
            {mode === 'mfa' && 'Enter the 6-digit code from your authenticator app'}
            {mode === 'forgot' && 'We’ll send secure password recovery instructions'}
            {mode === 'reset' && 'Enter your new strong password'}
            {mode === 'mfa-settings' && 'Protect your account with an authenticator app'}
          </p>
        </div>

        {/* Mode Tabs for Login & Signup */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#1B1812]/5 rounded-lg mb-6 border border-[#1B1812]/10">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                clearError();
                setLocalError(null);
              }}
              className={`py-2 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-[#1B1812] shadow-xs'
                  : 'text-[#1B1812]/60 hover:text-[#1B1812]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                clearError();
                setLocalError(null);
              }}
              className={`py-2 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-[#1B1812] shadow-xs'
                  : 'text-[#1B1812]/60 hover:text-[#1B1812]'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Global or Local Error Notice */}
        {(localError || error) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span>{localError || error}</span>
          </div>
        )}

        {/* Success Notice */}
        {successNotice && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Dev Mode Notification */}
        {devTokenNotice && (
          <div className="mb-4 p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] rounded-lg font-mono break-all">
            {devTokenNotice}
          </div>
        )}

        {/* GOOGLE SIGN-IN BUTTON */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="space-y-4 mb-5">
            <GoogleSignInButton
              text={mode === 'signup' ? 'signup_with' : 'continue_with'}
              onSuccess={() => {
                onSuccess?.();
                onClose();
              }}
            />

            <div className="relative flex items-center justify-center">
              <div className="border-t border-[#1B1812]/15 w-full" />
              <span className="bg-[#F6F3EC] px-3 text-xs uppercase tracking-wider text-[#1B1812]/50 font-medium">
                or with email
              </span>
            </div>
          </div>
        )}

        {/* STANDARD FORMS */}
        {mode !== 'mfa-settings' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Field (Sign up only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1B1812]/40">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#1B1812]/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#E8A33D] focus:border-transparent text-[#1B1812]"
                  />
                </div>
              </div>
            )}

            {/* Email Field (Login, Signup, Forgot) */}
            {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
              <div>
                <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1B1812]/40">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#1B1812]/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#E8A33D] focus:border-transparent text-[#1B1812]"
                  />
                </div>
              </div>
            )}

            {/* Password Field (Login, Signup) */}
            {(mode === 'login' || mode === 'signup') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        clearError();
                        setLocalError(null);
                      }}
                      className="text-xs text-[#E8A33D] hover:underline font-medium cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1B1812]/40">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-[#1B1812]/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#E8A33D] focus:border-transparent text-[#1B1812]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#1B1812]/40 hover:text-[#1B1812] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Indicator for Signup */}
                {mode === 'signup' && password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1 h-1 w-full bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strength.color}`}
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#1B1812]/70">{strength.label}</p>
                  </div>
                )}
              </div>
            )}

            {/* MFA Code Screen */}
            {mode === 'mfa' && (
              <div>
                <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider mb-1.5">
                  6-Digit Authenticator Code
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1B1812]/40">
                    <Shield className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-9 pr-3 py-2 text-center tracking-widest font-mono text-lg bg-white border border-[#1B1812]/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#E8A33D] text-[#1B1812]"
                  />
                </div>
              </div>
            )}

            {/* Reset Password Fields */}
            {mode === 'reset' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider mb-1.5">
                    Reset Token
                  </label>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Enter reset token"
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#1B1812]/20 rounded-md text-[#1B1812]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3 py-2 text-sm bg-white border border-[#1B1812]/20 rounded-md text-[#1B1812]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-3 py-2 text-sm bg-white border border-[#1B1812]/20 rounded-md text-[#1B1812]"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-[#1B1812] text-[#F6F3EC] rounded-md font-medium text-sm hover:bg-[#1B1812]/90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin text-[#E8A33D]" />}
              <span>
                {mode === 'login' && 'Sign In'}
                {mode === 'signup' && 'Create Account'}
                {mode === 'mfa' && 'Verify & Continue'}
                {mode === 'forgot' && 'Send Recovery Link'}
                {mode === 'reset' && 'Update Password'}
              </span>
            </button>

            {/* Back to sign in for Forgot/Reset/MFA */}
            {(mode === 'forgot' || mode === 'reset' || mode === 'mfa') && (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  clearError();
                  setLocalError(null);
                }}
                className="w-full py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            )}
          </form>
        ) : (
          /* MFA 2FA SETTINGS VIEW */
          <div className="space-y-5">
            {user?.totpEnabled ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-900">
                    Two-Factor Authentication is Active
                  </h3>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Your account is protected by your authenticator app.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDisableMfa}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors cursor-pointer"
                >
                  {isSubmitting ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            ) : mfaData ? (
              <form onSubmit={handleVerifyMfaSetup} className="space-y-4">
                <p className="text-xs text-[#1B1812]/80">
                  Scan this QR code with Google Authenticator, Authy, or 1Password:
                </p>

                <div className="flex justify-center p-3 bg-white border border-[#1B1812]/15 rounded-lg">
                  <img src={mfaData.qrCodeUrl} alt="2FA QR Code" className="w-44 h-44" />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[#1B1812]/70 uppercase tracking-wider">
                    Or enter manual key:
                  </span>
                  <div className="flex items-center gap-2 bg-white border border-[#1B1812]/15 rounded-md px-3 py-1.5">
                    <code className="text-xs font-mono text-[#1B1812] flex-1 break-all">
                      {mfaData.secret}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1 text-[#1B1812]/60 hover:text-[#1B1812] cursor-pointer"
                      title="Copy Key"
                    >
                      {copiedSecret ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1B1812]/80 uppercase tracking-wider mb-1.5">
                    Enter Verification Code from App
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={mfaVerifyCode}
                    onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full px-3 py-2 text-center tracking-widest font-mono text-base bg-white border border-[#1B1812]/20 rounded-md text-[#1B1812]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || mfaVerifyCode.length !== 6}
                  className="w-full py-2.5 px-4 bg-[#1B1812] text-[#F6F3EC] rounded-md font-medium text-sm hover:bg-[#1B1812]/90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin text-[#E8A33D]" />}
                  <span>Enable 2FA Protection</span>
                </button>
              </form>
            ) : (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#E8A33D]" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
