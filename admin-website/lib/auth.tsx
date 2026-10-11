'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from './api';
import { AdminUser, AuthSessionResponse } from './types';

interface AuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthSessionResponse>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await api.request<AdminUser>('/admin/auth/me');
      setUser(res);
      return res;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      // First try /admin/auth/me if we have access token
      if (api.getAccessToken()) {
        const currentUser = await fetchCurrentUser();
        if (currentUser) {
          setIsLoading(false);
          return;
        }
      }

      // If token expired or missing, try refresh cookie
      const newToken = await api.refreshToken();
      if (newToken) {
        await fetchCurrentUser();
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  useEffect(() => {
    api.setOnUnauthorized(() => {
      setUser(null);
      api.setAccessToken(null);
      if (pathname !== '/login') {
        router.push('/login');
      }
    });

    refreshSession();
  }, [refreshSession, pathname, router]);

  // Route protection
  useEffect(() => {
    if (isLoading) return;

    const isAuthRoute = pathname === '/login';

    if (!user && !isAuthRoute) {
      router.push('/login');
    } else if (user) {
      if (user.passwordChangeRequired && pathname !== '/change-password') {
        router.push('/change-password');
      } else if (!user.passwordChangeRequired && isAuthRoute) {
        router.push('/');
      }
    }
  }, [user, isLoading, pathname, router]);

  const login = async (email: string, password: string) => {
    const res = await api.request<AuthSessionResponse>('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    api.setAccessToken(res.accessToken);
    setUser(res.admin);

    if (res.admin.passwordChangeRequired) {
      router.push('/change-password');
    } else {
      router.push('/');
    }

    return res;
  };

  const logout = async () => {
    try {
      await api.request('/admin/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      api.setAccessToken(null);
      setUser(null);
      router.push('/login');
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await api.request<AuthSessionResponse>('/admin/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    api.setAccessToken(res.accessToken);
    setUser(res.admin);
    router.push('/');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        changePassword,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
