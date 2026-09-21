import axios from 'axios';
import { useAuthStore } from '@/store/auth';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const currentRefreshToken = useAuthStore.getState().refreshToken;
    if (!currentRefreshToken) throw new Error('No refresh token');
    refreshPromise = axios
      .post('/api/auth/refresh', { refreshToken: currentRefreshToken })
      .then((response) => {
        const data = response.data;
        useAuthStore.getState().setAuth(data.user, data.accessToken, data.refreshToken);
        return data.accessToken as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear auth and redirect to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _thanarahRetried?: boolean });
    if (
      error.response?.status === 401
      && original
      && !original._thanarahRetried
      && useAuthStore.getState().refreshToken
      && !String(original.url || '').includes('/auth/refresh')
    ) {
      original._thanarahRetried = true;
      try {
        const token = await refreshAccessToken();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        // Fall through to the final logout path below.
      }
    }
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ──── Auth ────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    industry?: string;
  }) => api.post('/auth/register', data).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  refresh: (refreshToken: string) =>
    axios.post('/api/auth/refresh', { refreshToken }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ──── Conversations ────────────────────────────────────────────────────────
export const conversationsApi = {
  list: () => api.get('/conversations').then((r) => r.data),
  create: (title?: string) =>
    api.post('/conversations', { title }).then((r) => r.data),
  messages: (id: string) =>
    api.get(`/conversations/${id}/messages`).then((r) => r.data),
  rename: (id: string, title: string) =>
    api.put(`/conversations/${id}/title`, { title }).then((r) => r.data),
  pin: (id: string, pinned: boolean) =>
    api.post(`/conversations/${id}/pin`, { pinned }).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/conversations/${id}`).then((r) => r.data),
};

// ──── Messages ─────────────────────────────────────────────────────────────
export const messagesApi = {
  list: (conversationId: string) =>
    api.get(`/messages/${conversationId}`).then((r) => r.data),
  feedback: (messageId: string, rating: 'up' | 'down', correction?: string) =>
    api.post(`/messages/${messageId}/feedback`, { rating, correction }).then((r) => r.data),
  pin: (messageId: string, pinned: boolean) =>
    api.post(`/messages/${messageId}/pin`, { pinned }).then((r) => r.data),
};

// ──── Files ─────────────────────────────────────────────────────────────────
export const filesApi = {
  extract: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/extract', formData).then((r) => r.data);
  },
};

// ──── AI ───────────────────────────────────────────────────────────────────
export const aiApi = {
  chat: (conversationId: string, content: string) =>
    api.post('/ai/chat', { conversationId, content }).then((r) => r.data),
  health: () => api.get('/ai/health').then((r) => r.data),
  capabilities: () => api.get('/ai/capabilities').then((r) => r.data),
  skills: () => api.get('/ai/skills').then((r) => r.data),
  voiceCapabilities: () => api.get('/ai/voice/capabilities').then((r) => r.data),
  backends: () => api.get('/ai/backends').then((r) => r.data),
  updateBackend: (id: string, data: any) =>
    api.put(`/ai/backends/${id}`, data).then((r) => r.data),
  testBackend: (id: string) =>
    api.post(`/ai/backends/${id}/test`).then((r) => r.data),
};

// ──── API Keys ─────────────────────────────────────────────────────────────
export const apiKeysApi = {
  list: () => api.get('/api-keys').then((r) => r.data),
  create: (data: { name: string; environment?: string; scopes?: string[] }) =>
    api.post('/api-keys', data).then((r) => r.data),
  revoke: (id: string) =>
    api.delete(`/api-keys/${id}`).then((r) => r.data),
};

// ──── Knowledge ────────────────────────────────────────────────────────────
export const knowledgeApi = {
  list: () => api.get('/knowledge').then((r) => r.data),
  create: (data: any) => api.post('/knowledge', data).then((r) => r.data),
  search: (query: string) =>
    api.post('/knowledge/search', { query }).then((r) => r.data),
  delete: (id: string) => api.delete(`/knowledge/${id}`).then((r) => r.data),
};

// ──── Admin ────────────────────────────────────────────────────────────────
export const adminApi = {
  stats: () => api.get('/admin/stats').then((r) => r.data),
  logs: () => api.get('/admin/logs').then((r) => r.data),
  tenants: () => api.get('/admin/tenants').then((r) => r.data),
  apiKeys: () => api.get('/admin/api-keys').then((r) => r.data),
};

// ──── Tenants ──────────────────────────────────────────────────────────────
export const tenantsApi = {
  list: () => api.get('/tenants').then((r) => r.data),
  myTenant: () => api.get('/tenants/my').then((r) => r.data),
  usage: () => api.get('/tenants/my/usage').then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/tenants/${id}`, data).then((r) => r.data),
  updateAiConfig: (id: string, data: any) =>
    api.put(`/tenants/${id}/ai-config`, data).then((r) => r.data),
  updateClinicBrain: (id: string, data: any) =>
    api.put(`/tenants/${id}/clinic-brain`, data).then((r) => r.data),
};

// ──── AI Context Profile ────────────────────────────────────────────────────
export const contextProfilesApi = {
  get: () => api.get('/context-profile/me').then((r) => r.data),
  update: (data: any) => api.put('/context-profile/me', data).then((r) => r.data),
  remove: () => api.delete('/context-profile/me').then((r) => r.data),
  suggestions: () => api.get('/context-profile/suggestions').then((r) => r.data),
};

// ──── Health ───────────────────────────────────────────────────────────────
export const healthApi = {
  full: () => api.get('/health/full').then((r) => r.data),
};
