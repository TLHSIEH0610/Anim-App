import { api } from './client';

export interface SupportTicketPayload {
  subject: string;
  body: string;
  category?: string;
  book_id?: number;
  app_version?: string;
  build?: string;
  device_os?: string;
  api_base?: string;
}

export async function createSupportTicket(token: string, payload: SupportTicketPayload) {
  const resp = await api.post('/support/tickets', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.data;
}

