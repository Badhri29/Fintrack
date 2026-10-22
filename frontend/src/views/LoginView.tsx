import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  Edit2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

type AuthMode = 'signin' | 'register';

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const {
    login,
    sendRegistrationOtp,
    verifyRegistrationOtp,
    verifyExistingAccount,
    resendOtp,
    loginDemo
  } = useAuth();

  // Mode states
  const [authMode, setAuthMode] = useState<AuthMode>('signin');

  // Input states
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [otp, setOtp] = useState<string>('');

  // Step states: 'form' = details, 'otp_register' = new account, 'otp_existing' = unverified account
  const [step, setStep] = useState<'form' | 'otp_register' | 'otp_existing'>('form');

  // Feedback states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // Timers
  const [timer, setTimer] = useState<number>(300); // 5 minutes countdown
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Countdown timer effect
  useEffect(() => {
    let interval: any = null;
    if (step !== 'form' && timer > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, timer]);

  // Resend cooldown timer effect
  useEffect(() => {
    let interval: any = null;
    if (resendCooldown > 0) {
      interval = setInterval(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendCooldown]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle Initial Submit (Sign In or Send Registration OTP)
  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setDevOtp(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError('Please provide your email address and password.');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address (e.g. name@gmail.com).');
      return;
    }

    if (authMode === 'register' && password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      if (authMode === 'register') {
        const res = await sendRegistrationOtp(cleanEmail);
        setDevOtp(res.devOtp || null);
        setInfoMessage(res.message || `Verification code sent to ${cleanEmail}`);
        setStep('otp_register');
        setTimer(300);
        setResendCooldown(30);
      } else {
        const result = await login(cleanEmail, password);
        if (result && result.requiresVerification) {
          setDevOtp(result.devOtp || null);
          setInfoMessage(result.message || 'Verification required. A 6-digit code has been sent to your email.');
          setStep('otp_existing');
          setTimer(300);
          setResendCooldown(30);
        } else {
          onLoginSuccess();
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP Verification Submit
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
      } else {
        await verifyExistingAccount(email.trim().toLowerCase(), otp.trim());
      }
      onLoginSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);

    try {
      const purpose = step === 'otp_existing' ? 'Account Verification' : 'Account Registration';
      const res = await resendOtp(email.trim().toLowerCase(), purpose);
      setDevOtp(res.devOtp || null);
      setInfoMessage(res.message || 'A new verification code has been sent to your email!');
      setTimer(300);
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Demo Login Handler
  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginDemo();
      onLoginSuccess();
    } catch {
      setError('Demo login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: 'radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.15), transparent 40%), radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.15), transparent 40%), #0B0E14',
        overflow: 'hidden',
        padding: '20px'
      }}
    >
      {/* Decorative ambient glowing spheres */}
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%)',
          top: '-150px',
          left: '-100px',
          filter: 'blur(60px)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
          bottom: '-150px',
          right: '-100px',
          filter: 'blur(60px)',
          pointerEvents: 'none'
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'rgba(18, 24, 38, 0.85)',
          backdropFilter: 'blur(24px)',
          borderRadius: 24,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.15)',
          padding: '36px 32px',
          zIndex: 10,
          position: 'relative'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 13,
              borderRadius: 18,
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: '#FFFFFF',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
              marginBottom: 16
            }}
          >
            <Wallet size={28} />
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
              margin: '0 0 6px 0'
            }}
          >
            FinTrack Intelligence
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#94A3B8' }}>
            Personal Net Worth & Financial Analytics
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#FCA5A5',
              fontSize: 12,
              marginBottom: 18,
              lineHeight: 1.4
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        )}

        {/* Global Info / Success Banner */}
        {infoMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              color: '#A5B4FC',
              fontSize: 12,
              marginBottom: 18,
              lineHeight: 1.4
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1, color: '#818CF8' }} />
            <div>{infoMessage}</div>
          </div>
        )}

        {/* ================= STEP 1: LOGIN / REGISTER DETAILS FORM ================= */}
        {step === 'form' && (
          <>
            {/* Toggle: Sign In vs Create Account */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: 4,
                marginBottom: 22
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                  setInfoMessage(null);
                }}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: 9,
                  border: 'none',
                  background: authMode === 'signin' ? '#6366F1' : 'transparent',
                  color: authMode === 'signin' ? '#FFFFFF' : '#94A3B8',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError(null);
                  setInfoMessage(null);
                }}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: 9,
                  border: 'none',
                  background: authMode === 'register' ? '#6366F1' : 'transparent',
                  color: authMode === 'register' ? '#FFFFFF' : '#94A3B8',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleInitialSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Full Name (Only for Registration) */}
              {authMode === 'register' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginBottom: 5, fontWeight: 700, letterSpacing: '0.05em' }}>
                    YOUR FULL NAME
                  </label>
                  <div style={{ position: 'relative' }}>
                    <UserIcon
                      size={17}
                      style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }}
                    />
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '11px 14px 11px 42px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: 12,
                        color: '#F8FAFC',
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Email Address */}
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginBottom: 5, fontWeight: 700, letterSpacing: '0.05em' }}>
                  EMAIL ADDRESS
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={17}
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }}
                  />
                  <input
                    type="email"
                    placeholder="name@gmail.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px 11px 42px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 12,
                      color: '#F8FAFC',
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
                {authMode === 'register' && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748B' }}>
                    ✓ Real-time 6-digit verification code will be sent to your Gmail inbox.
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginBottom: 5, fontWeight: 700, letterSpacing: '0.05em' }}>
                  PASSWORD
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={17}
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }}
                  />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px 11px 42px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 12,
                      color: '#F8FAFC',
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '13px',
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 6px 20px rgba(99, 102, 241, 0.45)',
                  marginTop: 6,
                  transition: 'all 0.2s',
                  opacity: loading ? 0.7 : 1
                }}
              >
                <span>
                  {loading
                    ? (authMode === 'register' ? 'Validating & Sending OTP...' : 'Signing In...')
                    : (authMode === 'register' ? 'Send Verification OTP' : 'Sign In')}
                </span>
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>

            {/* Divider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                margin: '22px 0',
                color: '#475569',
                fontSize: 12
              }}
            >
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
              <span>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
            </div>

            {/* Quick Demo Login */}
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '11px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.03)',
                color: '#E2E8F0',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={16} style={{ color: '#F59E0B' }} />
              <span>Quick Login with Demo Account</span>
            </button>
          </>
        )}

        {/* ================= STEP 2: OTP VERIFICATION SCREEN ================= */}
        {step !== 'form' && (
          <div>
            {/* Header for OTP */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div
                style={{
                  display: 'inline-flex',
                  padding: 12,
                  borderRadius: 16,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818CF8',
                  marginBottom: 12,
                  border: '1px solid rgba(99, 102, 241, 0.3)'
                }}
              >
                <ShieldCheck size={26} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F8FAFC', margin: '0 0 6px 0' }}>
                Enter Verification Code
              </h2>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#94A3B8' }}>
                We have sent a 6-digit verification code to:
              </p>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#A5B4FC'
                }}
              >
                <Mail size={13} />
                <span>{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('form');
                    setError(null);
                    setInfoMessage(null);
                    setOtp('');
                  }}
                  title="Change email"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Edit2 size={12} />
                </button>
              </div>
            </div>

            {/* Dev Mode OTP Display (if local testing without SMTP) */}
            {devOtp && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px dashed #F59E0B',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 16,
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: 11, color: '#FCD34D', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                  DEV TEST OTP CODE
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '4px', color: '#F59E0B' }}>
                  {devOtp}
                </span>
              </div>
            )}

            <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginBottom: 8, fontWeight: 700, letterSpacing: '0.05em', textAlign: 'center' }}>
                  6-DIGIT VERIFICATION CODE
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound
                    size={17}
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }}
                  />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 42px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      borderRadius: 12,
                      color: '#FFFFFF',
                      fontSize: 20,
                      fontWeight: 700,
                      letterSpacing: '8px',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Timer & Resend Button */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  padding: '0 2px'
                }}
              >
                <span style={{ color: timer > 0 ? '#94A3B8' : '#EF4444' }}>
                  {timer > 0 ? `Code expires in: ${formatTimer(timer)}` : 'Code expired'}
                </span>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: resendCooldown > 0 ? '#64748B' : '#818CF8',
                    cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                >
                  <RotateCcw size={13} />
                  <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}</span>
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || otp.length < 4}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '13px',
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: (loading || otp.length < 4) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                  transition: 'all 0.2s',
                  opacity: (loading || otp.length < 4) ? 0.6 : 1
                }}
              >
                <span>{loading ? 'Verifying Code...' : (step === 'otp_existing' ? 'Verify & Sign In' : 'Verify & Create Account')}</span>
                {!loading && <CheckCircle2 size={18} />}
              </button>

              {/* Back to sign in button */}
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setError(null);
                  setDevOtp(null);
                  setOtp('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'center',
                  padding: '6px'
                }}
              >
                ← Return to Sign In
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
