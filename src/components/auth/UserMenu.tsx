import React, { useState, useRef, useEffect } from 'react';
import {
  User as UserIcon,
  LogOut,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthModalMode } from './AuthModal';

interface UserMenuProps {
  onOpenAuth: (mode: AuthModalMode) => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ onOpenAuth }) => {
  const { user, logout, verifyEmail } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button
          id="header-signin-btn"
          type="button"
          onClick={() => onOpenAuth('login')}
          className="px-3 py-2 text-xs sm:text-sm font-medium text-[#1B1812] hover:text-[#1B1812]/80 transition-colors cursor-pointer"
        >
          Sign In
        </button>
        <button
          id="header-signup-btn"
          type="button"
          onClick={() => onOpenAuth('signup')}
          className="hidden sm:inline-flex px-3.5 py-1.5 text-xs sm:text-sm font-medium border border-[#1B1812]/20 rounded-md hover:border-[#1B1812] text-[#1B1812] transition-all cursor-pointer"
        >
          Sign Up
        </button>
      </div>
    );
  }

  const initial = user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        id="user-menu-btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-full sm:rounded-md border border-[#1B1812]/15 hover:border-[#1B1812]/30 bg-white text-[#1B1812] transition-all cursor-pointer shadow-xs"
        aria-expanded={isOpen}
      >
        <div className="w-7 h-7 rounded-full bg-[#E8A33D]/20 text-[#1B1812] font-semibold text-xs flex items-center justify-center">
          {initial}
        </div>
        <span className="hidden sm:inline-block text-xs font-medium max-w-[120px] truncate text-[#1B1812]">
          {user.name || user.email.split('@')[0]}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[#1B1812]/50" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#F6F3EC] border border-[#1B1812]/15 rounded-xl shadow-xl py-2 z-40 animate-in fade-in zoom-in-95 duration-100">
          {/* User Details */}
          <div className="px-4 py-3 border-b border-[#1B1812]/10">
            <p className="text-sm font-semibold text-[#1B1812] truncate">
              {user.name || 'FoundIt User'}
            </p>
            <p className="text-xs text-[#1B1812]/60 truncate mt-0.5">{user.email}</p>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {user.emailVerified ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3 h-3" />
                  Unverified
                </span>
              )}

              {user.totpEnabled ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
                  <ShieldCheck className="w-3 h-3" />
                  2FA Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                  <Shield className="w-3 h-3" />
                  2FA Off
                </span>
              )}

              {user.role === 'admin' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 border border-purple-200">
                  Admin
                </span>
              )}
            </div>
          </div>

          {verifyNotice && (
            <div className="px-4 py-2 text-[11px] text-emerald-800 bg-emerald-50 border-b border-emerald-100">
              {verifyNotice}
            </div>
          )}

          {/* Actions */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenAuth('mfa-settings');
              }}
              className="w-full px-4 py-2 text-xs text-[#1B1812] hover:bg-[#1B1812]/5 flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-[#E8A33D]" />
              <span>{user.totpEnabled ? 'Manage 2FA Settings' : 'Enable Two-Factor (2FA)'}</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                setIsOpen(false);
                await logout();
              }}
              className="w-full px-4 py-2 text-xs text-red-700 hover:bg-red-50 flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
