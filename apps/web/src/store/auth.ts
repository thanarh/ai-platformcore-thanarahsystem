'use client';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

interface User {
  _id: string;
  email?: string;
  phoneNumber?: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId?: string;
  isEmbedded?: boolean;
  embeddedIntegrationId?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setAuth: (user: User, token: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  isAdmin: () => boolean;
}

const EMBED_CONTEXT_KEY = 'thanarah-embed-context-v1';

function getEmbeddedContext(): { id: string; origin?: string } | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/embed\/([a-f\d]{24})(?:\/|$)/i);
  if (match) {
    const params = new URLSearchParams(window.location.search);
    const context = { id: match[1].toLowerCase(), origin: params.get('origin') || undefined };
    try { window.sessionStorage.setItem(EMBED_CONTEXT_KEY, JSON.stringify(context)); } catch {}
    return context;
  }
  try {
    const raw = window.sessionStorage.getItem(EMBED_CONTEXT_KEY);
    if (!raw) return null;
    const context = JSON.parse(raw);
    return typeof context.id === 'string' && /^[a-f\d]{24}$/i.test(context.id) ? context : null;
  } catch { return null; }
}

export function getEmbeddedBrowserContext() { return getEmbeddedContext(); }

const embeddedAwareStorage: StateStorage = {
  getItem(name) {
    if (typeof window === 'undefined') return null;
    const context = getEmbeddedContext();
    try {
      return context
        ? window.sessionStorage.getItem(`${name}:embed:${context.id}`)
        : window.localStorage.getItem(name);
    } catch { return null; }
  },
  setItem(name, value) {
    if (typeof window === 'undefined') return;
    const context = getEmbeddedContext();
    try {
      if (context) window.sessionStorage.setItem(`${name}:embed:${context.id}`, value);
      else window.localStorage.setItem(name, value);
    } catch { /* A blocked storage backend never exposes another session. */ }
  },
  removeItem(name) {
    if (typeof window === 'undefined') return;
    const context = getEmbeddedContext();
    try {
      if (context) window.sessionStorage.removeItem(`${name}:embed:${context.id}`);
      else window.localStorage.removeItem(name);
    } catch {}
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setAuth: (user, token, refreshToken) => set({ user, token, refreshToken }),
      setUser: (user) => set({ user }),
      clearAuth: () => set({ user: null, token: null, refreshToken: null }),
      isAdmin: () => {
        const role = get().user?.role;
        return role === 'OWNER' || role === 'ADMIN' || role === 'AI_ADMIN';
      },
    }),
    {
      name: 'thanarah-auth',
      storage: createJSONStorage<AuthState>(() => embeddedAwareStorage),
      skipHydration: typeof window !== 'undefined' && Boolean(getEmbeddedContext()),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
