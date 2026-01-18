import type { ApiResponse, PaginatedResponse, Contact, Interaction, Introduction, AnalyticsDashboard } from '../types';

const API_URL = 'https://obani-api-new.vercel.app/api';

function getToken(): string | null {
  const stored = localStorage.getItem('obani_auth');
  if (stored) {
    const { token } = JSON.parse(stored);
    return token;
  }
  return null;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Auth
export const auth = {
  register: (email: string, password: string, name: string) =>
    request<{ user: { id: string; email: string; name: string }; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ user: { id: string; email: string; name: string }; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ id: string; email: string; name: string }>('/auth/me'),
};

// Contacts
export const contacts = {
  list: (page = 1, pageSize = 50, filters?: Record<string, string>) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...filters });
    return request<PaginatedResponse<Contact>>(`/contacts?${params}`);
  },
  getAll: () => request<Contact[]>('/contacts/all'),
  get: (id: string) => request<Contact>(`/contacts/${id}`),
  create: (contact: Partial<Contact>) =>
    request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(contact) }),
  update: (id: string, updates: Partial<Contact>) =>
    request<Contact>(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id: string) => request<void>(`/contacts/${id}`, { method: 'DELETE' }),
};

// Interactions
export const interactions = {
  list: (page = 1, pageSize = 50) =>
    request<PaginatedResponse<Interaction>>(`/interactions?page=${page}&pageSize=${pageSize}`),
  getByContact: (contactId: string) =>
    request<PaginatedResponse<Interaction>>(`/contacts/${contactId}/interactions`),
  create: (interaction: Partial<Interaction>) =>
    request<Interaction>('/interactions', { method: 'POST', body: JSON.stringify(interaction) }),
  update: (id: string, updates: Partial<Interaction>) =>
    request<Interaction>(`/interactions/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id: string) => request<void>(`/interactions/${id}`, { method: 'DELETE' }),
};

// Introductions
export const introductions = {
  list: (status?: string, page = 1, pageSize = 20) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set('status', status);
    return request<PaginatedResponse<Introduction>>(`/introductions?${params}`);
  },
  getSuggested: (limit = 10) => request<Introduction[]>(`/introductions/suggested?limit=${limit}`),
  create: (introduction: Partial<Introduction>) =>
    request<Introduction>('/introductions', { method: 'POST', body: JSON.stringify(introduction) }),
  update: (id: string, updates: Partial<Introduction>) =>
    request<Introduction>(`/introductions/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
};

// Analytics
export const analytics = {
  getDashboard: () => request<AnalyticsDashboard>('/analytics'),
  getAtRisk: (limit = 10) => request<Contact[]>(`/analytics/at-risk?limit=${limit}`),
};

export default { auth, contacts, interactions, introductions, analytics };
