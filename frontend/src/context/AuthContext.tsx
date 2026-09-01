import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';

export interface User {
  id: number;
  email: string;
  name: string;
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
        let currentUser = res.data.user;
        const profRes = await api.get('/profile').catch(() => null);
        if (profRes?.data?.success && profRes.data.data?.name) {
          currentUser = { ...currentUser, name: profRes.data.data.name };
        }
        setUser(currentUser);
      } else {
        setUser(null);
      }
    } catch (err) {
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
        let userData = res.data.user;
        const profRes = await api.get('/profile').catch(() => null);
        if (profRes?.data?.success && profRes.data.data?.name) {
          userData = { ...userData, name: profRes.data.data.name };
        }
        setUser(userData);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (data: Partial<User>) => {
    setUser(prev => (prev ? { ...prev, ...data } : null));
  };

  const login = async (email: string, pass: string) => {
    const res = await api.post('/auth/login', { email, password: pass });
    if (res.data && res.data.success) {
      if (res.data.token) localStorage.setItem('token', res.data.token);
      let userData = res.data.user;
      const profRes = await api.get('/profile').catch(() => null);
      if (profRes?.data?.success && profRes.data.data?.name) {
        userData = { ...userData, name: profRes.data.data.name };
      }
      setUser(userData);
    } else {
      throw new Error(res.data?.message || 'Invalid email or password');
    }
  };

  const register = async (email: string, pass: string, name?: string) => {
    const res = await api.post('/auth/register', { email, password: pass });
    if (res.data && res.data.success) {
      if (res.data.token) localStorage.setItem('token', res.data.token);
      let userData = res.data.user;
      if (name) {
        userData = { ...userData, name };
        await api.put('/profile', { name }).catch(() => null);
      }
      setUser(userData);
    } else {
      throw new Error(res.data?.message || 'Registration failed');
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout').catch(() => null);
    } finally {
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginDemo, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
