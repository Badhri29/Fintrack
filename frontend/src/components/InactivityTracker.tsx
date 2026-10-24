import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export const InactivityTracker: React.FC = () => {
  const { user, logout } = useAuth();
  const [inactivityMinutes, setInactivityMinutes] = useState<number>(15);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);

  const isDemo = user?.email === 'demo@fintrack.io';

  // 1. Fetch system inactivity timeout from backend
  useEffect(() => {
    if (!user) return;

    if (isDemo) {
      setInactivityMinutes(5); // Demo account strictly 5 minutes
      return;
    }

    api.get('/system/inactivity-timeout')
      .then(res => {
        if (res.data?.success && res.data.inactivityTimeoutMinutes) {
          setInactivityMinutes(Number(res.data.inactivityTimeoutMinutes));
        }
      })
      .catch(() => {
        setInactivityMinutes(15);
      });
  }, [user, isDemo]);

  // 2. Track user interactions (reset lastActivity)
  useEffect(() => {
    if (!user) return;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      // If we are currently showing countdown, clear it if user interacts
      setSecondsLeft(null);
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetActivity));

    // Periodic check every 1 second
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastActivityRef.current) / 1000);
      const totalTimeoutSeconds = inactivityMinutes * 60;
      const remaining = totalTimeoutSeconds - elapsedSeconds;

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        logout();
      } else if (remaining <= 10) {
        setSecondsLeft(remaining);
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, resetActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, inactivityMinutes, logout]);

  const handleKeepAlive = () => {
    lastActivityRef.current = Date.now();
    setSecondsLeft(null);
  };

  if (!user || secondsLeft === null) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: '#181102',
        border: '2px solid #F59E0B',
        borderRadius: 14,
        padding: '16px 20px',
        maxWidth: 380,
        boxShadow: '0 12px 36px rgba(245, 158, 11, 0.4)',
        animation: 'pulse 1.5s infinite',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F59E0B'
          }}
        >
          <AlertTriangle size={20} />
        </div>

        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#FFF' }}>
            {isDemo ? 'Demo Session Expiring' : 'Inactivity Warning'}
          </div>
          <div style={{ fontSize: 11, color: '#FCD34D' }}>
            Auto sign-out in <strong>{secondsLeft}s</strong> due to inactivity
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={handleKeepAlive}
          style={{
            flex: 1,
            background: '#F59E0B',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <RefreshCw size={12} />
          <span>Keep Me Signed In</span>
        </button>

        <button
          type="button"
          onClick={logout}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#94A3B8',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Sign Out Now
        </button>
      </div>
    </div>
  );
};
