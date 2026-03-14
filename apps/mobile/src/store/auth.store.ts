import { create } from 'zustand';

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
}

/**
 * Minimal auth store holding the JWT access token.
 * Set after login/register; cleared on logout.
 */
export const useAuthStore = create<AuthState>(set => ({
  token: null,
  setToken: token => set({ token }),
}));
