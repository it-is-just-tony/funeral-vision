import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'owner';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  walletLimit: number;
  walletCount?: number;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<{ needsApproval: boolean }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  updateUser: (user: User) => void;
  setAuthFromOAuth: (accessToken: string, refreshToken: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = '/api/auth';

// Token storage keys
const ACCESS_TOKEN_KEY = 'fv_access_token';
const REFRESH_TOKEN_KEY = 'fv_refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Store tokens
  const storeTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }, []);

  // Clear tokens
  const clearTokens = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, []);

  // Get stored tokens
  const getStoredTokens = useCallback(() => ({
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  }), []);

  // Refresh access token
  const refreshAuth = useCallback(async () => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const { refreshToken } = getStoredTokens();
    if (!refreshToken) {
      setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      return;
    }

    const refreshPromise = (async () => {
      try {
        const initialRefreshToken = refreshToken;
        const response = await fetch(`${API_BASE}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        const result = await response.json();

        if (result.success && result.data) {
          storeTokens(result.data.accessToken, result.data.refreshToken);
          setState({
            user: result.data.user,
            accessToken: result.data.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          const { refreshToken: currentRefreshToken } = getStoredTokens();
          if (currentRefreshToken && currentRefreshToken !== initialRefreshToken) {
            refreshInFlight.current = null;
            await refreshAuth();
            return;
          }
          clearTokens();
          setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
        const { refreshToken: currentRefreshToken } = getStoredTokens();
        if (currentRefreshToken && currentRefreshToken !== refreshToken) {
          refreshInFlight.current = null;
          await refreshAuth();
          return;
        }
        clearTokens();
        setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      } finally {
        refreshInFlight.current = null;
      }
    })();

    refreshInFlight.current = refreshPromise;
    return refreshPromise;
  }, [getStoredTokens, storeTokens, clearTokens]);

  // Login
  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Login failed');
    }

    storeTokens(result.data.accessToken, result.data.refreshToken);
    setState({
      user: result.data.user,
      accessToken: result.data.accessToken,
      isAuthenticated: true,
      isLoading: false,
    });
  }, [storeTokens]);

  // Register
  const register = useCallback(async (email: string, password: string, name: string) => {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Registration failed');
    }

    // If user is auto-approved (open registration), store tokens
    if (result.data.accessToken) {
      storeTokens(result.data.accessToken, result.data.refreshToken);
      setState({
        user: result.data.user,
        accessToken: result.data.accessToken,
        isAuthenticated: true,
        isLoading: false,
      });
      return { needsApproval: false };
    }

    // User needs approval
    return { needsApproval: true };
  }, [storeTokens]);

  // Logout
  const logout = useCallback(async () => {
    const { accessToken, refreshToken } = getStoredTokens();

    try {
      if (accessToken) {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    }

    clearTokens();
    setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
  }, [getStoredTokens, clearTokens]);

  // Update user (for profile updates)
  const updateUser = useCallback((user: User) => {
    setState((prev) => ({ ...prev, user }));
  }, []);

  // Set auth state from OAuth callback
  const setAuthFromOAuth = useCallback((accessToken: string, refreshToken: string) => {
    storeTokens(accessToken, refreshToken);
    // Trigger refresh to get user data
    refreshAuth();
  }, [storeTokens, refreshAuth]);

  // Initialize auth state on mount
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // Set up token refresh interval (refresh 1 minute before expiry)
  useEffect(() => {
    if (!state.isAuthenticated) return;

    // Refresh every 14 minutes (tokens expire in 15)
    const interval = setInterval(() => {
      refreshAuth();
    }, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, [state.isAuthenticated, refreshAuth]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshAuth,
        updateUser,
        setAuthFromOAuth,
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

// Hook to get access token for API calls
export function useAccessToken() {
  const { accessToken, refreshAuth } = useAuth();

  const getToken = useCallback(async () => {
    if (accessToken) return accessToken;
    await refreshAuth();
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }, [accessToken, refreshAuth]);

  return getToken;
}
