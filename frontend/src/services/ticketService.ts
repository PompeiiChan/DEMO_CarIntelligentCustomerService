import { API_BASE } from '../lib/config';
import type { MockTicket } from '../mocks/tickets';

export type Ticket = MockTicket;

export interface TicketListParams {
  status?: string;
  category?: string;
  emotion?: string;
  sort?: 'wait_time_desc' | 'priority_desc' | 'created_asc';
  page?: number;
  page_size?: number;
}

export interface TicketListResponse {
  items: Ticket[];
  total: number;
  page: number;
  page_size: number;
}

export interface TicketDetail extends Ticket {
  session_id: string;
  agent_id?: string;
  assigned_at?: string;
  completed_at?: string;
  resolved_at?: string;
  history: Array<{ role: string; content: string; timestamp: string }>;
}

export async function fetchTickets(params?: TicketListParams): Promise<TicketListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.category) qs.set('category', params.category);
  if (params?.emotion) qs.set('emotion', params.emotion);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.page_size != null) qs.set('page_size', String(params.page_size));
  const res = await fetch(`${API_BASE}/v1/tickets?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message ?? '获取工单列表失败');
  return json.data as TicketListResponse;
}

export async function fetchTicket(ticketId: string): Promise<TicketDetail> {
  const res = await fetch(`${API_BASE}/v1/tickets/${ticketId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message ?? '获取工单详情失败');
  return json.data as TicketDetail;
}
