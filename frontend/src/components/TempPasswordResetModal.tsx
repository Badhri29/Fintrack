import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, CheckCircle, AlertCircle, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export const TempPasswordResetModal: React.FC = () => {
  const { user, updateUser, refreshUserData } = useAuth();

  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user?.mustChangePassword) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/change-temp-password', {
        newPassword: newPassword.trim()
      });

      if (res.data?.success) {
        setSuccess('New password set successfully! Unlocking your account...');
        setTimeout(() => {
          updateUser({ mustChangePassword: false, isTemporaryPassword: false });
          refreshUserData();
        }, 1200);
      } else {
        setError(res.data?.error || 'Failed to update password.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(5, 8, 15, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#0D111A',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          borderRadius: 18,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(99, 102, 241, 0.15)',
          overflow: 'hidden'
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)',
            padding: '24px 28px 20px',
            borderBottom: '1px solid #1A2234',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFF',
              flexShrink: 0,
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
            }}
          >
            <KeyRound size={24} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
                Set Your New Password
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#F59E0B',
                  background: 'rgba(245, 158, 11, 0.15)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}
              >
                REQUIRED
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              You logged in using a single-use temporary password. For your security, you must configure a permanent password before continuing.
            </p>
          </div>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px 28px 28px' }}>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#EF4444',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10B981',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <CheckCircle size={16} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* New Password */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 6 }}>
                ENTER NEW PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#64748B' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 42px',
                    borderRadius: 10,
                    border: '1px solid #1E2638',
                    background: '#07090E',
                    color: '#FFF',
                    fontSize: 14,
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 12,
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    cursor: 'pointer'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 6 }}>
                CONFIRM NEW PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#64748B' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-type your new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    borderRadius: 10,
                    border: '1px solid #1E2638',
                    background: '#07090E',
                    color: '#FFF',
                    fontSize: 14,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} style={{ color: '#6366F1' }} />
              <span>Once saved, your temporary password is permanently deactivated.</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || Boolean(success)}
              style={{
                marginTop: 6,
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.35)',
                opacity: loading ? 0.7 : 1
              }}
            >
              <Lock size={16} />
              <span>{loading ? 'Saving New Password...' : 'Save New Password & Continue'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
