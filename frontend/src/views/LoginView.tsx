import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Mail,
  Lock,
  User as UserIcon,
  ShieldCheck,
  AlertCircle,
  Clock,
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

type AuthMode = 'signin' | 'register';
type TabType = 'user' | 'admin';

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const {
    login,
    sendRegistrationOtp,
    verifyRegistrationOtp,
    verifyExistingAccount,
    resendOtp,
    loginDemo,
    maintenanceInfo
  } = useAuth();

  // Active tab: 'user' or 'admin'
  const [activeTab, setActiveTab] = useState<TabType>('user');

  // Mode states (for user login: signin or register)
  const [authMode, setAuthMode] = useState<AuthMode>('signin');

  // Input states (empty by default, clear watermark placeholders)
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [otp, setOtp] = useState<string>('');

  // Step states for registration OTP
  const [step, setStep] = useState<'form' | 'otp_register' | 'otp_existing'>('form');

  // Feedback states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // Lock & Maintenance modals
  const [lockModal, setLockModal] = useState<{
    isOpen: boolean;
    lockType?: string;
    lockUntil?: string;
    lockReason?: string;
    message?: string;
  }>({ isOpen: false });

  const [maintenanceModal, setMaintenanceModal] = useState<{
    isOpen: boolean;
    message?: string;
    endTime?: string;
  }>({ isOpen: false });

  const [demoExpiredAlert, setDemoExpiredAlert] = useState<boolean>(false);

  // Timers
  const [timer, setTimer] = useState<number>(300);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  useEffect(() => {
    const handleDemoExpired = () => {
      setDemoExpiredAlert(true);
    };
    window.addEventListener('fintrack-demo-expired', handleDemoExpired);
    return () => window.removeEventListener('fintrack-demo-expired', handleDemoExpired);
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (step !== 'form' && timer > 0) {
      interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  useEffect(() => {
    let interval: any = null;
    if (resendCooldown > 0) {
      interval = setInterval(() => setResendCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setEmail('');
    setPassword('');
    setAdminEmail('');
    setAdminPassword('');
    setError(null);
    setInfoMessage(null);
    setStep('form');
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Submit Handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setDevOtp(null);

    const isUser = activeTab === 'user';
    const rawIdentifier = isUser ? email.trim() : adminEmail.trim();
    const effectivePass = isUser ? password : adminPassword;

    if (!rawIdentifier || !effectivePass) {
      setError('Please provide email/Member ID and password.');
      return;
    }

    const isMemberId = isUser && (
      rawIdentifier.toUpperCase().startsWith('MEM-') ||
      !rawIdentifier.includes('@')
    );

    // If it's registration, must be a valid email
    if (isUser && authMode === 'register') {
      if (!rawIdentifier.includes('@') || !rawIdentifier.includes('.')) {
        setError('Please enter a valid email address for registration.');
        return;
      }
    } else {
      // Login mode: if not a Member ID, must have @ and .
      if (!isMemberId && (!rawIdentifier.includes('@') || !rawIdentifier.includes('.'))) {
        setError('Please enter a valid email address or Member ID.');
        return;
      }
    }

    const effectiveEmail = isMemberId ? rawIdentifier.toUpperCase() : rawIdentifier.toLowerCase();

    setLoading(true);

    try {
      // 1. New user registration step
      if (isUser && authMode === 'register') {
        if (effectivePass.length < 6) {
          setError('Password must be at least 6 characters long.');
          setLoading(false);
          return;
        }
        const res = await sendRegistrationOtp(effectiveEmail);
        setDevOtp(res.devOtp || null);
        setInfoMessage(res.message || `Verification code sent to ${effectiveEmail}`);
        setStep('otp_register');
        setTimer(300);
        setResendCooldown(30);
        setLoading(false);
        return;
      }

      // 2. Sign In (User or Admin)
      const result = await login(effectiveEmail, effectivePass);

      // Unregistered Account Auto-Redirect
      if (result.unregistered) {
        if (!isMemberId) {
          setAuthMode('register');
          setInfoMessage('No account found with this email. We have transferred you to Sign Up to create your account!');
        } else {
          setError('Member ID not found. Please verify your Member ID or contact your workspace owner.');
        }
        setLoading(false);
        return;
      }

      // Scheduled Maintenance check
      if (result.isMaintenance) {
        setMaintenanceModal({
          isOpen: true,
          message: result.maintenanceMessage || 'System maintenance in progress.',
          endTime: result.maintenanceEnd
        });
        setLoading(false);
        return;
      }

      // Locked account check
      if (result.isLocked) {
        setLockModal({
          isOpen: true,
          lockType: result.lockType,
          lockUntil: result.lockUntil,
          lockReason: result.lockReason,
          message: result.message
        });
        setLoading(false);
        return;
      }

      // Verification required check
      if (result.requiresVerification) {
        setDevOtp(result.devOtp || null);
        setInfoMessage(result.message || 'Verification required. Code sent to your email.');
        setStep('otp_existing');
        setTimer(300);
        setResendCooldown(30);
        setLoading(false);
        return;
      }

      if (result.success) {
        onLoginSuccess();
      } else {
        setError(result.message || 'Invalid email or password.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // OTP Verification Submit
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.trim().length < 4) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      if (step === 'otp_register') {
        await verifyRegistrationOtp({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          password,
          name: name.trim() || undefined
        });
        sessionStorage.setItem('fintrack_is_new_registration', 'true');
      } else {
        await verifyExistingAccount(email.trim().toLowerCase(), otp.trim());
      }
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);

    try {
      const purpose = step === 'otp_existing' ? 'Account Verification' : 'Account Registration';
      const res = await resendOtp(email.trim().toLowerCase(), purpose);
      setDevOtp(res.devOtp || null);
      setInfoMessage(res.message || 'A new verification code has been sent!');
      setTimer(300);
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-page"
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.15), transparent 40%), radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.15), transparent 40%), #0A0D14',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Maintenance Notification Banner if active */}
      {maintenanceInfo?.active && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 20,
            right: 20,
            maxWidth: 1080,
            margin: '0 auto',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            color: '#FCD34D',
            padding: '12px 20px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <AlertTriangle size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>System Notice:</strong> {maintenanceInfo.message}
            {maintenanceInfo.endTime && <span> • Expected completion: <strong>{maintenanceInfo.endTime}</strong></span>}
          </div>
        </div>
      )}

      {/* Main Login Card (Clean, centered single-card auth container) */}
      <div
        className="auth-card"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#0F131D',
          border: '1px solid #1E2638',
          borderRadius: 24,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 10,
          padding: '36px 32px'
        }}
      >
        {/* FinTrack Brand Logo Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 26 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}
          >
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em', lineHeight: 1.1 }}>FinTrack</div>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.04em' }}>Secure personal finance</div>
          </div>
        </div>

        {/* Top Switcher Tabs: User login vs Admin login */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: '#090C13',
            borderRadius: 12,
            padding: 4,
            border: '1px solid #1A2234',
            marginBottom: 28
          }}
        >
            <button
              type="button"
              onClick={() => handleTabChange('user')}
              style={{
                background: activeTab === 'user' ? '#1E2638' : 'transparent',
                color: activeTab === 'user' ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s ease',
                boxShadow: activeTab === 'user' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              <UserIcon size={15} />
              <span>User login</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('admin')}
              style={{
                background: activeTab === 'admin' ? 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)' : 'transparent',
                color: activeTab === 'admin' ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s ease',
                boxShadow: activeTab === 'admin' ? '0 2px 12px rgba(124, 58, 237, 0.4)' : 'none'
              }}
            >
              <ShieldCheck size={15} />
              <span>Admin login</span>
            </button>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
              {activeTab === 'user'
                ? authMode === 'register'
                  ? 'Create an account'
                  : 'Welcome back'
                : 'Super admin access'}
            </h2>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {activeTab === 'user'
                ? authMode === 'register'
                  ? 'Register securely to monitor your net worth and accounts'
                  : 'Sign in to your personal or shared account'
                : 'Restricted to the application administrator'}
            </p>
          </div>

          {/* Error & Info Alerts */}
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#F87171',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 20
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <div>{error}</div>
            </div>
          )}

          {infoMessage && (
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60A5FA',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 20
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <div>{infoMessage}</div>
            </div>
          )}

          {/* STEP: OTP Verification */}
          {step !== 'form' ? (
            <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  borderRadius: 12,
                  padding: 16,
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: 13, color: '#CBD5E1', marginBottom: 6 }}>
                  Enter the 6-digit code sent to:
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#6366F1' }}>{email}</div>
                {devOtp && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 10px', borderRadius: 6 }}>
                    Simulator OTP: <strong>{devOtp}</strong>
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 8 }}>
                  Verification Code (OTP)
                </label>
                <input
                  className="auth-input"
                  type="text"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 10,
                    border: '1px solid #2A364F',
                    background: '#090C13',
                    color: '#FFF',
                    fontSize: 22,
                    textAlign: 'center',
                    letterSpacing: '8px',
                    outline: 'none'
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#94A3B8' }}>Expires in: {formatTimer(timer)}</span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: resendCooldown > 0 ? '#64748B' : '#6366F1',
                    cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: 600
                  }}
                >
                  <RotateCcw size={12} />
                  <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
                }}
              >
                {loading ? 'Verifying...' : 'Complete & Sign In'}
              </button>

              <button
                type="button"
                onClick={() => setStep('form')}
                style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}
              >
                Back to details
              </button>
            </form>
          ) : (
            /* STEP: Form Details */
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Optional Name field if Registering */}
              {activeTab === 'user' && authMode === 'register' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>
                    Full Name
                  </label>
                  <div style={{ position: 'relative' }}>
                    <UserIcon size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#64748B' }} />
                    <input
                      className="auth-input"
                      type="text"
                      placeholder="Enter your name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 42px',
                        borderRadius: 10,
                        border: '1px solid #1E2638',
                        background: '#090C13',
                        color: '#FFF',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Email Address */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>
                  {activeTab === 'admin' ? 'Admin email' : 'Email or Member ID'}
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#64748B' }} />
                  <input
                    className="auth-input"
                    type="text"
                    name={`ft_email_${activeTab}`}
                    id={activeTab === 'admin' ? 'admin-email-field' : 'user-email-field'}
                    placeholder={activeTab === 'admin' ? 'Enter admin email' : 'Enter email or Member ID (e.g. MEM-123456)'}
                    value={activeTab === 'user' ? email : adminEmail}
                    onChange={e => {
                      if (activeTab === 'user') setEmail(e.target.value);
                      else setAdminEmail(e.target.value);
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 42px',
                      borderRadius: 10,
                      border: '1px solid #1E2638',
                      background: '#090C13',
                      color: '#FFF',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#64748B' }} />
                  <input
                    className="auth-input"
                    type={showPassword ? 'text' : 'password'}
                    name={`ft_pwd_${activeTab}`}
                    id={activeTab === 'admin' ? 'admin-password-field' : 'user-password-field'}
                    placeholder="Enter your password"
                    value={activeTab === 'user' ? password : adminPassword}
                    onChange={e => {
                      if (activeTab === 'user') setPassword(e.target.value);
                      else setAdminPassword(e.target.value);
                    }}
                    autoComplete="new-password"
                    data-lpignore="true"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 42px 12px 42px',
                      borderRadius: 10,
                      border: '1px solid #1E2638',
                      background: '#090C13',
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

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 10,
                  border: 'none',
                  background:
                    activeTab === 'admin'
                      ? 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)'
                      : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 6,
                  boxShadow:
                    activeTab === 'admin'
                      ? '0 4px 16px rgba(124, 58, 237, 0.4)'
                      : '0 4px 16px rgba(37, 99, 235, 0.4)',
                  transition: 'transform 0.1s ease'
                }}
              >
                <Lock size={16} />
                <span>
                  {loading
                    ? 'Processing...'
                    : activeTab === 'admin'
                    ? 'Enter admin portal'
                    : authMode === 'register'
                    ? 'Create account'
                    : 'Sign in securely'}
                </span>
              </button>

              {/* Toggle User Mode (Sign In vs Register) */}
              {activeTab === 'user' && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  {authMode === 'signin' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setError(null);
                        setInfoMessage(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60A5FA',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      New to FinTrack? Create an account
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setError(null);
                        setInfoMessage(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60A5FA',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Already have an account? Sign in
                    </button>
                  )}
                </div>
              )}

              {/* Demo Account Access Tip (User tab only) */}
              {activeTab === 'user' && (
                <div
                  style={{
                    marginTop: 20,
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid #1A2234',
                    borderRadius: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    <span>Explore instant demo account without registration</span>
                  </div>
                  <button
                    type="button"
                    onClick={loginDemo}
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: '#818CF8',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Sparkles size={12} />
                    <span>Try Demo</span>
                  </button>
                </div>
              )}
            </form>
          )}
      </div>

      {/* MODAL: Account Locked Warning */}
      {lockModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: '#131824',
              border: '1px solid #EF4444',
              borderRadius: 16,
              padding: 28,
              maxWidth: 460,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#EF4444'
                }}
              >
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#F8FAFC' }}>
                  Account Locked
                </h3>
                <span style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>
                  {lockModal.lockType === 'TEMP'
                    ? 'Temporary Access Lock'
                    : lockModal.lockType === 'PERMANENT'
                    ? 'Permanent Administrative Lock'
                    : 'Account Restricted'}
                </span>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 16 }}>
              {lockModal.message || 'Your account access has been restricted by the administrator.'}
            </p>

            {lockModal.lockReason && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#FCA5A5',
                  marginBottom: 16
                }}
              >
                <strong>Reason:</strong> {lockModal.lockReason}
              </div>
            )}

            {lockModal.lockUntil && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#94A3B8',
                  marginBottom: 20
                }}
              >
                <Clock size={14} style={{ color: '#F59E0B' }} />
                <span>Automatic Unlock Scheduled: <strong>{new Date(lockModal.lockUntil).toLocaleString()}</strong></span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setLockModal({ isOpen: false })}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                border: 'none',
                background: '#1E2638',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Maintenance Notice */}
      {maintenanceModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: '#131824',
              border: '1px solid #F59E0B',
              borderRadius: 16,
              padding: 28,
              maxWidth: 460,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#F59E0B'
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#F8FAFC' }}>
                  Scheduled Maintenance Underway
                </h3>
                <span style={{ fontSize: 12, color: '#FCD34D', fontWeight: 600 }}>System Optimization Window</span>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 16 }}>
              {maintenanceModal.message}
            </p>

            {maintenanceModal.endTime && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#FCD34D',
                  marginBottom: 20
                }}
              >
                Expected Completion: <strong>{maintenanceModal.endTime}</strong>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMaintenanceModal({ isOpen: false })}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                border: 'none',
                background: '#1E2638',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ALERT: Demo Session Expired */}
      {demoExpiredAlert && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: '#131824',
              border: '1px solid #3B82F6',
              borderRadius: 16,
              padding: 28,
              maxWidth: 440,
              width: '100%',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <Clock size={28} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#FFF' }}>
              Demo Session Expired
            </h3>
            <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6, marginBottom: 24 }}>
              Your 5-minute demo preview session has concluded. You can log into the demo again or register for a free permanent account!
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setDemoExpiredAlert(false);
                  loginDemo();
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 8,
                  border: '1px solid #2A364F',
                  background: '#1E2638',
                  color: '#FFF',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Restart Demo
              </button>

              <button
                type="button"
                onClick={() => {
                  setDemoExpiredAlert(false);
                  setActiveTab('user');
                  setAuthMode('register');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#3B82F6',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
