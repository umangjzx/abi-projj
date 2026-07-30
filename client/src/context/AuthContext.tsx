import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setAccessToken, setUnauthorizedHandler, ApiError } from '@/lib/api';
import type { User } from '@/types';

interface LoginResult {
  user: User;
  accessToken: string;
}

interface RegisterResult {
  user: User;
  accessToken: string | null;
  requiresVerification: boolean;
  message: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<RegisterResult>;
  verifyEmail: (email: string, otp: string) => Promise<User>;
  resendOtp: (email: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (input: { name?: string; phone?: string; avatarUrl?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const queryClient = useQueryClient();

  const clearSession = React.useCallback(() => {
    setAccessToken(null);
    setUser(null);
    // Drop every cached query so a second user on the same browser cannot see
    // the previous user's data.
    queryClient.clear();
  }, [queryClient]);

  /**
   * Session restore on first mount. The access token lives only in memory, so
   * after a page reload we exchange the httpOnly refresh cookie for a new one.
   */
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const refreshed = await api.refresh();
        if (cancelled) return;

        if (refreshed) {
          const me = await api.get<User>('/auth/me');
          if (!cancelled) setUser(me);
        }
      } catch {
        // No valid session -- browsing anonymously is the expected outcome.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client calls this when a refresh attempt finally fails.
  React.useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const result = await api.post<LoginResult>('/auth/login', { email, password }, { skipRefresh: true });
      setAccessToken(result.accessToken);
      setUser(result.user);
      // Any data cached while anonymous is now stale.
      await queryClient.invalidateQueries();
      return result.user;
    },
    [queryClient],
  );

  const register = React.useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      const result = await api.post<RegisterResult>('/auth/register', input, { skipRefresh: true });
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        setUser(result.user);
      }
      return result;
    },
    [],
  );

  const verifyEmail = React.useCallback(
    async (email: string, otp: string) => {
      const result = await api.post<LoginResult>('/auth/verify-email', { email, otp }, { skipRefresh: true });
      setAccessToken(result.accessToken);
      setUser(result.user);
      await queryClient.invalidateQueries();
      return result.user;
    },
    [queryClient],
  );

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the server call fails, the local session must be cleared.
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = React.useCallback(async () => {
    try {
      setUser(await api.get<User>('/auth/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clearSession();
    }
  }, [clearSession]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role.name === 'ADMIN',
      login,
      register,
      verifyEmail,
      logout,
      refreshUser,
      resendOtp: (email, purpose) => api.post('/auth/resend-otp', { email, purpose }, { skipRefresh: true }).then(() => undefined),
      forgotPassword: (email) => api.post('/auth/forgot-password', { email }, { skipRefresh: true }).then(() => undefined),
      resetPassword: (email, otp, newPassword) =>
        api.post('/auth/reset-password', { email, otp, newPassword }, { skipRefresh: true }).then(() => undefined),
      changePassword: async (currentPassword, newPassword) => {
        await api.post('/auth/change-password', { currentPassword, newPassword });
        // The server revokes all sessions on a password change.
        clearSession();
      },
      updateProfile: async (input) => {
        const updated = await api.patch<User>('/auth/me', input);
        setUser(updated);
        return updated;
      },
    }),
    [user, isLoading, login, register, verifyEmail, logout, refreshUser, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
