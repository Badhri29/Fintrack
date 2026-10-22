import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { yearService } from '../services/yearService';

export interface User {
  id: number;
  email: string;
  name: string;
  photo?: string;
  isVerified?: boolean;
}

export interface LoginResult {
  success: boolean;
  requiresVerification?: boolean;
  identifier?: string;
  devOtp?: string;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<LoginResult>;
  sendRegistrationOtp: (email: string) => Promise<{ success: boolean; devOtp?: string; message?: string }>;
  verifyRegistrationOtp: (params: { email: string; otp: string; password: string; name?: string }) => Promise<void>;
  verifyExistingAccount: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string, purpose?: string) => Promise<{ devOtp?: string; message?: string }>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    checkUser();
  }, []);

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
        if (!currentUser.photo) {
          const cachedPhoto = localStorage.getItem('fintrack_user_photo');
          if (cachedPhoto) currentUser.photo = cachedPhoto;
        }
        if (currentUser.email === 'demo@fintrack.io') {
          seedDemoBudgetData();
        }
        setUser(currentUser);
      } else {
        setUser(null);
      }
    } catch {
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
        if (!userData.photo) {
          const cachedPhoto = localStorage.getItem('fintrack_user_photo');
          if (cachedPhoto) userData.photo = cachedPhoto;
        }
        seedDemoBudgetData(true);
        yearService.resetToCurrentYear();
        setUser(userData);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (data: Partial<User>) => {
    if (data.photo !== undefined) {
      if (data.photo) localStorage.setItem('fintrack_user_photo', data.photo);
      else localStorage.removeItem('fintrack_user_photo');
    }
    setUser(prev => (prev ? { ...prev, ...data } : null));
  };

  const login = async (email: string, pass: string): Promise<LoginResult> => {
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
      const profRes = await api.get('/profile').catch(() => null);
      if (profRes?.data?.success && profRes.data.data) {
        if (profRes.data.data.name) userData.name = profRes.data.data.name;
        if (profRes.data.data.photo) userData.photo = profRes.data.data.photo;
      }
      if (!userData.photo) {
        const cachedPhoto = localStorage.getItem('fintrack_user_photo');
        if (cachedPhoto) userData.photo = cachedPhoto;
      }
      yearService.resetToCurrentYear();
      setUser(userData);
      return { success: true };
    } else {
      throw new Error(res.data?.error || res.data?.message || 'Invalid email or password');
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
    localStorage.removeItem('token');
    localStorage.removeItem('fintrack_user_photo');
    yearService.resetToCurrentYear();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        sendRegistrationOtp,
        verifyRegistrationOtp,
        verifyExistingAccount,
        resendOtp,
        loginDemo,
        logout,
        updateUser
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
