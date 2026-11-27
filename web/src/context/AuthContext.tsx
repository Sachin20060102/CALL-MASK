import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearTokens, getStoredTokens, storeTokens } from '../api/client';
import type { AccountLimits, UserProfile } from '../types/api';

interface AuthContextValue {
  user: UserProfile | null;
  limits: AccountLimits | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [limits, setLimits] = useState<AccountLimits | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const { accessToken } = getStoredTokens();
    if (!accessToken) {
      setUser(null);
      setLimits(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.me();
      setUser(data.user);
      setLimits(data.limits);
    } catch {
      clearTokens();
      setUser(null);
      setLimits(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    storeTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    await refreshProfile();
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await api.register({ email, password, fullName });
    storeTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    await refreshProfile();
  };

  const logout = async () => {
    const { refreshToken } = getStoredTokens();
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch {
        // Proceed clearing local tokens regardless
      }
    }
    clearTokens();
    setUser(null);
    setLimits(null);
  };

  return (
    <AuthContext.Provider value={{ user, limits, loading, login, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
