import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { yearService } from '../services/yearService';

export interface User {
  id: number;
  email: string;
  name: string;
  photo?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name?: string) => Promise<void>;
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

  const login = async (email: string, pass: string) => {
    const res = await api.post('/auth/login', { email, password: pass });
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
    } else {
      throw new Error(res.data?.message || 'Invalid email or password');
    }
  };

  const register = async (email: string, pass: string, name?: string) => {
    const res = await api.post('/auth/register', { email, password: pass });
    if (res.data && res.data.success) {
      if (res.data.token) localStorage.setItem('token', res.data.token);
      let userData: User = res.data.user;
      if (name) {
        await api.put('/profile', { name }).catch(() => null);
        userData.name = name;
      }
      yearService.resetToCurrentYear();
      setUser(userData);
    } else {
      throw new Error(res.data?.message || 'Registration failed');
    }
  };

  const logout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('fintrack_user_photo');
    yearService.resetToCurrentYear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginDemo, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
