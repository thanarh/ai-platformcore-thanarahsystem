import axios from 'axios';
import { useAuthStore } from '@/store/auth';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

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
  (error) => {
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
  }) => api.post('/auth/register', data).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
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
  delete: (id: string) =>
    api.delete(`/conversations/${id}`).then((r) => r.data),
};

// ──── Messages ─────────────────────────────────────────────────────────────
export const messagesApi = {
  list: (conversationId: string) =>
    api.get(`/messages/${conversationId}`).then((r) => r.data),
};

// ──── AI ───────────────────────────────────────────────────────────────────
export const aiApi = {
  chat: (conversationId: string, content: string) =>
    api.post('/ai/chat', { conversationId, content }).then((r) => r.data),
  health: () => api.get('/ai/health').then((r) => r.data),
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
};

// ──── Tenants ──────────────────────────────────────────────────────────────
export const tenantsApi = {
  list: () => api.get('/tenants').then((r) => r.data),
  myTenant: () => api.get('/tenants/my').then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/tenants/${id}`, data).then((r) => r.data),
  updateAiConfig: (id: string, data: any) =>
    api.put(`/tenants/${id}/ai-config`, data).then((r) => r.data),
  updateClinicBrain: (id: string, data: any) =>
    api.put(`/tenants/${id}/clinic-brain`, data).then((r) => r.data),
};

// ──── Health ───────────────────────────────────────────────────────────────
export const healthApi = {
  full: () => api.get('/health/full').then((r) => r.data),
};
