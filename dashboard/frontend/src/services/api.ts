import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
});

api.interceptors.response.use(
  response => response,
  error => {
    // Redirect to login on 401 only for authenticated API calls (not the /auth/me check itself)
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);

// ─── Ticket System API ────────────────────────────────────────────────────────

export const ticketApi = {
  getConfig: (guildId: string) =>
    api.get(`/api/guilds/${guildId}/ticket-config`).then(r => r.data),

  updateConfig: (guildId: string, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-config`, data).then(r => r.data),

  getPanels: (guildId: string) =>
    api.get(`/api/guilds/${guildId}/ticket-panels`).then(r => r.data),

  createPanel: (guildId: string, data: any) =>
    api.post(`/api/guilds/${guildId}/ticket-panels`, data).then(r => r.data),

  updatePanel: (guildId: string, panelId: number, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-panels/${panelId}`, data).then(r => r.data),

  deletePanel: (guildId: string, panelId: number) =>
    api.delete(`/api/guilds/${guildId}/ticket-panels/${panelId}`).then(r => r.data),

  createCategory: (guildId: string, panelId: number, data: any) =>
    api.post(`/api/guilds/${guildId}/ticket-panels/${panelId}/categories`, data).then(r => r.data),

  updateCategory: (guildId: string, categoryId: number, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-categories/${categoryId}`, data).then(r => r.data),

  deleteCategory: (guildId: string, categoryId: number) =>
    api.delete(`/api/guilds/${guildId}/ticket-categories/${categoryId}`).then(r => r.data),

  getFormFields: (guildId: string, categoryId: number) =>
    api.get(`/api/guilds/${guildId}/ticket-categories/${categoryId}/form-fields`).then(r => r.data),

  createFormField: (guildId: string, categoryId: number, data: any) =>
    api.post(`/api/guilds/${guildId}/ticket-categories/${categoryId}/form-fields`, data).then(r => r.data),

  updateFormField: (guildId: string, fieldId: number, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-form-fields/${fieldId}`, data).then(r => r.data),

  deleteFormField: (guildId: string, fieldId: number) =>
    api.delete(`/api/guilds/${guildId}/ticket-form-fields/${fieldId}`).then(r => r.data),

  getTickets: (guildId: string, params?: { status?: string; panel_id?: number }) =>
    api.get(`/api/guilds/${guildId}/tickets`, { params }).then(r => r.data),

  getGroups: (guildId: string) =>
    api.get(`/api/guilds/${guildId}/ticket-panel-groups`).then(r => r.data),

  createGroup: (guildId: string, data: { name: string }) =>
    api.post(`/api/guilds/${guildId}/ticket-panel-groups`, data).then(r => r.data),

  updateGroup: (guildId: string, groupId: number, data: { name: string }) =>
    api.put(`/api/guilds/${guildId}/ticket-panel-groups/${groupId}`, data).then(r => r.data),

  deleteGroup: (guildId: string, groupId: number) =>
    api.delete(`/api/guilds/${guildId}/ticket-panel-groups/${groupId}`).then(r => r.data),

  assignPanelGroup: (guildId: string, panelId: number, data: { group_id: number | null; stack_position: number }) =>
    api.put(`/api/guilds/${guildId}/ticket-panels/${panelId}/group`, data).then(r => r.data),

  sendGroup: (guildId: string, groupId: number, data: { channel_id: string }) =>
    api.post(`/api/guilds/${guildId}/ticket-panel-groups/${groupId}/send`, data).then(r => r.data),

  sendPanel: (guildId: string, panelId: number, data: { channel_id: string }) =>
    api.post(`/api/guilds/${guildId}/ticket-panels/${panelId}/send`, data).then(r => r.data),
};
