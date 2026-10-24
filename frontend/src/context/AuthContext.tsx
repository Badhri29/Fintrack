import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { yearService } from '../services/yearService';

export interface User {
  id: number;
  email: string;
  name: string;
  phone?: string;
  photo?: string;
  age?: number;
  gender?: string;
  isVerified?: boolean;
  role?: string; // 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  status?: string;
  lockType?: string;
  lockUntil?: string;
  lockReason?: string;
  subscriptionTier?: string; // 'FREE' | 'PRO' | 'ENTERPRISE'
  cardLimit?: number;
  canAccessDashboard?: boolean;
  canAccessReports?: boolean;
  canEditSettings?: boolean;
  isReadOnly?: boolean;
  lastLoginAt?: string;
  lastLogoutAt?: string;
  lastActivityAt?: string;
  isOnline?: boolean;
  loginCount?: number;
  mustChangePassword?: boolean;
  isTemporaryPassword?: boolean;
  temporaryPasswordExpiresAt?: string;
  parentUserId?: number;
  parentUserEmail?: string;
  memberPermission?: 'VIEW_ONLY' | 'CAN_EDIT';
  isMember?: boolean;
}

export interface MaintenanceInfo {
  active: boolean;
  message: string;
  startTime?: string;
  endTime?: string;
}

export interface LoginResult {
  success: boolean;
  requiresVerification?: boolean;
  identifier?: string;
  devOtp?: string;
  message?: string;
  unregistered?: boolean;
  isLocked?: boolean;
  lockType?: string;
  lockUntil?: string;
  lockReason?: string;
  isMaintenance?: boolean;
  maintenanceMessage?: string;
  maintenanceEnd?: string;
  mustChangePassword?: boolean;
  isTemporaryPassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  maintenanceInfo: MaintenanceInfo | null;
  demoTimeRemaining: number | null; // seconds remaining in demo session
  isAdmin: boolean;
  login: (email: string, pass: string) => Promise<LoginResult>;
  sendRegistrationOtp: (email: string) => Promise<{ success: boolean; devOtp?: string; message?: string }>;
  verifyRegistrationOtp: (params: { email: string; otp: string; password: string; name?: string }) => Promise<void>;
  verifyExistingAccount: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string, purpose?: string) => Promise<{ devOtp?: string; message?: string }>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [maintenanceInfo, setMaintenanceInfo] = useState<MaintenanceInfo | null>(null);
  const [demoTimeRemaining, setDemoTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    checkUser();
    checkMaintenance();
    const interval = setInterval(checkMaintenance, 30000); // Check maintenance every 30s
    return () => clearInterval(interval);
  }, []);

  // Demo auto-logout session timer (5 minutes = 300 seconds)
  useEffect(() => {
    if (user && user.email === 'demo@fintrack.io') {
      const storedStartTime = sessionStorage.getItem('fintrack_demo_start');
      let startTime = storedStartTime ? parseInt(storedStartTime, 10) : Date.now();
      if (!storedStartTime) {
        sessionStorage.setItem('fintrack_demo_start', String(startTime));
      }

      const DEMO_DURATION = 300; // 5 minutes in seconds

      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = DEMO_DURATION - elapsed;

        if (remaining <= 0) {
          clearInterval(timer);
          setDemoTimeRemaining(0);
          sessionStorage.removeItem('fintrack_demo_start');
          logout();
          window.dispatchEvent(new CustomEvent('fintrack-demo-expired'));
        } else {
          setDemoTimeRemaining(remaining);
        }
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setDemoTimeRemaining(null);
      sessionStorage.removeItem('fintrack_demo_start');
    }
  }, [user?.email]);

  const checkMaintenance = async () => {
    try {
      const res = await api.get('/system/maintenance');
      if (res.data?.success && res.data.data) {
        setMaintenanceInfo(res.data.data);
      }
    } catch {}
  };

  const refreshUserData = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data && res.data.user) {
        let currentUser: User = res.data.user;
        const profRes = await api.get('/profile').catch(() => null);
        if (profRes?.data?.success && profRes.data.data) {
          if (profRes.data.data.name) currentUser.name = profRes.data.data.name;
          if (profRes.data.data.photo) currentUser.photo = profRes.data.data.photo;
        }
        setUser(currentUser);
      }
    } catch {}
  };

  const checkUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.get('/auth/me');
      if (res.data && res.data.user) {
        let currentUser: User = res.data.user;
        const profRes = await api.get('/profile').catch(() => null);
        if (profRes?.data?.success && profRes.data.data) {
          if (profRes.data.data.name) currentUser.name = profRes.data.data.name;
          if (profRes.data.data.photo) currentUser.photo = profRes.data.data.photo;
        }
        if (currentUser.email === 'demo@fintrack.io') {
          seedDemoBudgetData();
        }
        localStorage.setItem('fintrack_user_cache', JSON.stringify(currentUser));
        setUser(currentUser);
      } else {
        localStorage.removeItem('fintrack_user_cache');
        setUser(null);
      }
    } catch {
      localStorage.removeItem('fintrack_user_cache');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const loginDemo = async () => {
    setLoading(true);
    try {
      let res = await api.post('/auth/login', { email: 'demo@fintrack.io', password: 'password123' }).catch(() => null);
      if (!res?.data?.success) {
        res = await api.post('/auth/register', { email: 'demo@fintrack.io', password: 'password123' }).catch(() => null);
      }
      if (res?.data?.success) {
        if (res.data.token) localStorage.setItem('token', res.data.token);
        let userData: User = res.data.user;
        const profRes = await api.get('/profile').catch(() => null);
        if (profRes?.data?.success && profRes.data.data) {
          if (profRes.data.data.name) userData.name = profRes.data.data.name;
          if (profRes.data.data.photo) userData.photo = profRes.data.data.photo;
        }
        sessionStorage.setItem('fintrack_demo_start', String(Date.now()));
        seedDemoBudgetData(true);
        yearService.resetToCurrentYear();
        localStorage.setItem('fintrack_user_cache', JSON.stringify(userData));
        setUser(userData);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (data: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      try {
        localStorage.setItem('fintrack_user_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const login = async (email: string, pass: string): Promise<LoginResult> => {
    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password: pass
      });

      if (res.data?.requiresVerification) {
        return {
          success: false,
          requiresVerification: true,
          identifier: res.data.identifier || email,
          devOtp: res.data.devOtp,
          message: res.data.message
        };
      }

      if (res.data && res.data.success) {
        if (res.data.token) localStorage.setItem('token', res.data.token);
        let userData: User = res.data.user;
        if (res.data.mustChangePassword || res.data.isTemporaryPassword) {
          userData.mustChangePassword = true;
          userData.isTemporaryPassword = true;
        }
        const profRes = await api.get('/profile').catch(() => null);
        if (profRes?.data?.success && profRes.data.data) {
          if (profRes.data.data.name) userData.name = profRes.data.data.name;
          if (profRes.data.data.photo) userData.photo = profRes.data.data.photo;
        }
        yearService.resetToCurrentYear();
        localStorage.setItem('fintrack_user_cache', JSON.stringify(userData));
        setUser(userData);
        return { success: true };
      }

      return {
        success: false,
        message: res.data?.error || res.data?.message || 'Login failed'
      };
    } catch (err: any) {
      const d = err.response?.data;
      if (d) {
        return {
          success: false,
          unregistered: d.unregistered,
          isLocked: d.isLocked,
          lockType: d.lockType,
          lockUntil: d.lockUntil,
          lockReason: d.lockReason,
          isMaintenance: d.isMaintenance,
          maintenanceMessage: d.maintenanceMessage,
          maintenanceEnd: d.maintenanceEnd,
          message: d.error || d.message || err.message
        };
      }
      return {
        success: false,
        message: err.message || 'Login failed'
      };
    }
  };

  const sendRegistrationOtp = async (email: string) => {
    const res = await api.post('/auth/send-registration-otp', {
      email: email.trim().toLowerCase()
    });
    if (res.data && res.data.success) {
      return {
        success: true,
        devOtp: res.data.devOtp,
        message: res.data.message
      };
    } else {
      throw new Error(res.data?.error || 'Failed to send verification code');
    }
  };

  const verifyRegistrationOtp = async (params: {
    email: string;
    otp: string;
    password: string;
    name?: string;
  }) => {
    const res = await api.post('/auth/verify-registration-otp', {
      email: params.email.trim().toLowerCase(),
      otp: params.otp.trim(),
      password: params.password,
      name: params.name?.trim()
    });

    if (res.data && res.data.success) {
      if (res.data.token) localStorage.setItem('token', res.data.token);
      let userData: User = res.data.user;
      if (params.name) {
        await api.put('/profile', { name: params.name }).catch(() => null);
        userData.name = params.name;
      }
      yearService.resetToCurrentYear();
      setUser(userData);
    } else {
      throw new Error(res.data?.error || 'Verification failed');
    }
  };

  const verifyExistingAccount = async (email: string, otp: string) => {
    const res = await api.post('/auth/verify-existing-account', {
      email: email.trim().toLowerCase(),
      otp: otp.trim()
    });

    if (res.data && res.data.success) {
      if (res.data.token) localStorage.setItem('token', res.data.token);
      let userData: User = res.data.user;
      setUser(userData);
    } else {
      throw new Error(res.data?.error || 'Failed to verify account');
    }
  };

  const resendOtp = async (email: string, purpose?: string) => {
    const res = await api.post('/auth/resend-otp', {
      email: email.trim().toLowerCase(),
      purpose
    });
    if (res.data && res.data.success) {
      return {
        devOtp: res.data.devOtp,
        message: res.data.message
      };
    } else {
      throw new Error(res.data?.error || 'Failed to resend verification code');
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout').catch(() => null);
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('fintrack_user_cache');
    sessionStorage.removeItem('fintrack_demo_start');
    yearService.resetToCurrentYear();
    setUser(null);
  };

  const isAdmin = Boolean(
    user?.role && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'SUPER_ADMIN')
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        maintenanceInfo,
        demoTimeRemaining,
        isAdmin,
        login,
        sendRegistrationOtp,
        verifyRegistrationOtp,
        verifyExistingAccount,
        resendOtp,
        loginDemo,
        logout,
        updateUser,
        refreshUserData
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
