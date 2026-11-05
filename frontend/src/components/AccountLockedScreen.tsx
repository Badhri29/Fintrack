import React, { useState, useEffect } from 'react';
import { Lock, AlertTriangle, RotateCcw, LogOut, Clock, ShieldAlert } from 'lucide-react';
import { type User, type LockInfo } from '../context/AuthContext';

interface AccountLockedScreenProps {
  user: User;
  lockInfo: LockInfo;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export const AccountLockedScreen: React.FC<AccountLockedScreenProps> = ({
  user,
  lockInfo,
  onRefresh,
  onLogout
}) => {
  const [checking, setChecking] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isExpired: boolean } | null>(null);

  const lockUntil = lockInfo.lockUntil || user.lockUntil;
  const lockType = (lockInfo.lockType || user.lockType || 'TEMP').toUpperCase();
  const lockReason = lockInfo.lockReason || user.lockReason || 'Account restricted by administrator.';

  useEffect(() => {
    if (!lockUntil || lockType !== 'TEMP') return;

    const calculateTimeRemaining = () => {
      const target = new Date(lockUntil).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        // Automatically check if unlocked
        onRefresh();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ hours, minutes, seconds, isExpired: false });
    };

    calculateTimeRemaining();
    const timer = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(timer);
  }, [lockUntil, lockType, onRefresh]);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setChecking(false), 600);
    }
  };

  const isTemp = lockType === 'TEMP';

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #171C28 0%, #0B0E14 70%)',
        padding: 20,
        boxSizing: 'border-box',
        color: '#F8FAFC',
        fontFamily: 'inherit'
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: 'rgba(19, 24, 36, 0.95)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 24,
          padding: '36px 32px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(239, 68, 68, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Top Glowing Ambient Ring */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 200,
            height: 120,
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, transparent 70%)',
            pointerEvents: 'none'
          }}
        />

        {/* Shield / Lock Icon with pulse */}
        <div
          style={{
            position: 'relative',
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EF4444',
            marginBottom: 20
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: '50%',
              border: '2px dashed rgba(239, 68, 68, 0.25)',
              animation: 'fintrack-spin 12s linear infinite'
            }}
          />
          {isTemp ? <Lock size={36} /> : <ShieldAlert size={36} />}
        </div>

        {/* Status Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 999,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#F87171',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 12
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#EF4444',
              display: 'inline-block'
            }}
          />
          <span>{isTemp ? 'Temporary Access Lock' : 'Account Blocked / Restricted'}</span>
        </div>

        {/* Heading */}
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, letterSpacing: '-0.3px', color: '#FFFFFF' }}>
          {isTemp ? 'Your Account is Temporarily Locked' : 'Account Access Restricted'}
        </h2>

        {/* User Info Line */}
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>
          Signed in as <strong style={{ color: '#F1F5F9' }}>{user.name || user.email}</strong>
          {user.email && <span style={{ opacity: 0.7, marginLeft: 6 }}>({user.email})</span>}
        </div>

        {/* Description / Reason Card */}
        <div
          style={{
            width: '100%',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 14,
            padding: '16px 18px',
            textAlign: 'left',
            marginBottom: 20,
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            <AlertTriangle size={13} />
            <span>Administrative Reason</span>
          </div>
          <div style={{ fontSize: 13.5, color: '#FEE2E2', lineHeight: 1.5, fontWeight: 600 }}>
            "{lockReason}"
          </div>
        </div>

        {/* Countdown Timer (for TEMP Lock) */}
        {isTemp && lockUntil && (
          <div
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 24,
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: '#94A3B8', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={13} style={{ color: '#F59E0B' }} />
                <span>Scheduled Auto-Unlock:</span>
              </div>
              <strong style={{ color: '#F1F5F9' }}>
                {new Date(lockUntil).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </strong>
            </div>

            {timeLeft && !timeLeft.isExpired ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', marginTop: 10 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '8px 4px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#60A5FA', fontFamily: 'monospace' }}>
                    {String(timeLeft.hours).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748B', fontWeight: 700 }}>HOURS</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '8px 4px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#60A5FA', fontFamily: 'monospace' }}>
                    {String(timeLeft.minutes).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748B', fontWeight: 700 }}>MINUTES</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '8px 4px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#60A5FA', fontFamily: 'monospace' }}>
                    {String(timeLeft.seconds).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748B', fontWeight: 700 }}>SECONDS</div>
                </div>
              </div>
            ) : timeLeft?.isExpired ? (
              <div style={{ color: '#10B981', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                ✓ Lock period has expired. Click below to verify & unlock your session!
              </div>
            ) : null}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={handleManualCheck}
            disabled={checking}
            style={{
              width: '100%',
              padding: '12px 18px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
              border: 'none',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 700,
              cursor: checking ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.15s ease'
            }}
          >
            <RotateCcw size={15} style={{ animation: checking ? 'fintrack-spin 0.8s linear infinite' : 'none' }} />
            <span>{checking ? 'Checking Status with Server...' : 'Check / Re-verify Account Status'}</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '10px 18px',
              borderRadius: 10,
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94A3B8',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <LogOut size={14} />
            <span>Sign Out & Return to Login</span>
          </button>
        </div>

        {/* Footer Note */}
        <div style={{ marginTop: 22, fontSize: 11, color: '#64748B' }}>
          Questions about this lock? Please reach out to your administrator or support team.
        </div>

        <style>{`
          @keyframes fintrack-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};
