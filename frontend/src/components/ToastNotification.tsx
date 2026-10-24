import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { playNotificationChime } from '../services/soundService';

export interface ToastPayload {
  id?: string;
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'error' | 'info';
  duration?: number;
}

export const showToast = (toast: ToastPayload) => {
  window.dispatchEvent(new CustomEvent('fintrack-toast', { detail: toast }));
};

export const ToastNotification: React.FC = () => {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: any) => {
      const detail: ToastPayload = e.detail;
      if (!detail || !detail.title) return;

      const toastId = detail.id || `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newToast: ToastPayload = {
        ...detail,
        id: toastId,
        type: detail.type || 'success',
        duration: detail.duration || 4000
      };

      // Play audio chime
      playNotificationChime();

      setToasts(prev => [newToast, ...prev.slice(0, 3)]); // Keep at most 4 toasts visible

      // Auto dismiss
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, newToast.duration);
    };

    window.addEventListener('fintrack-toast', handleToastEvent);
    return () => window.removeEventListener('fintrack-toast', handleToastEvent);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 380,
        width: 'calc(100vw - 48px)',
        pointerEvents: 'none'
      }}
    >
      {toasts.map(toast => {
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';
        const isError = toast.type === 'error';

        const borderColor = isSuccess ? '#10B981' : isWarning ? '#F59E0B' : isError ? '#EF4444' : '#6366F1';
        const iconColor = borderColor;
        const bgGradient = isSuccess
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%)'
          : isWarning
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%)'
          : isError
          ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%)'
          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%)';

        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              background: '#0F172A',
              backgroundImage: bgGradient,
              border: `1px solid ${borderColor}`,
              borderRadius: 14,
              padding: '14px 16px',
              color: '#FFFFFF',
              boxShadow: `0 12px 32px rgba(0, 0, 0, 0.7), 0 0 16px ${borderColor}33`,
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              transition: 'all 0.25s ease'
            }}
          >
            <div style={{ color: iconColor, marginTop: 2, flexShrink: 0 }}>
              {isSuccess && <CheckCircle size={20} />}
              {isWarning && <AlertTriangle size={20} />}
              {isError && <AlertCircle size={20} />}
              {!isSuccess && !isWarning && !isError && <Info size={20} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', marginBottom: 2 }}>
                {toast.title}
              </div>
              <div style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.45 }}>
                {toast.message}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
