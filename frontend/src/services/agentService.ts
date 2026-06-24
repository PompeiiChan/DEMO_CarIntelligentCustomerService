import { API_BASE } from '../lib/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentWsEvent =
  | { type: 'pending_tickets'; tickets: AgentTicket[] }
  | { type: 'new_ticket'; ticket: AgentTicket }
  | { type: 'user_message'; ticket_id: string; session_id: string; content: string }
  | { type: 'pong' };

export interface AgentTicket {
  ticket_id: string;
  session_id: string;
  status: string;
  priority: string;
  category: string;
  emotion: string;
  transfer_reason: string;
  preview: string;
  wait_seconds: number;
  round: number;
  agent_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export function createAgentWs(
  agentId: string,
  onEvent: (event: AgentWsEvent) => void,
  onClose?: () => void,
): WebSocket {
  // Vite 代理将 /ws → ws://localhost:8199，ws:true 已在 vite.config.ts 配置
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/agent/${agentId}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string) as AgentWsEvent;
      onEvent(data);
    } catch {
      // ignore malformed frames
    }
  };

  // 心跳 ping，每 30s 一次
  const pingTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);

  ws.onclose = () => {
    clearInterval(pingTimer);
    onClose?.();
  };

  return ws;
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

export async function assignTicket(ticketId: string, agentId: string = 'A001'): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tickets/${ticketId}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { code: number; message?: string };
  if (json.code !== 200) throw new Error(json.message ?? '接单失败');
}

export async function postAgentMessage(
  ticketId: string,
  content: string,
  agentId: string = 'A001',
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { code: number; message?: string };
  if (json.code !== 200) throw new Error(json.message ?? '发送消息失败');
}

export async function resolveTicket(
  ticketId: string,
  agentId: string = 'A001',
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tickets/${ticketId}/resolve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { code: number; message?: string };
  if (json.code !== 200) throw new Error(json.message ?? '结束工单失败');
}

export async function markBadCase(
  ticketId: string,
  agentId: string = 'A001',
  note?: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tickets/${ticketId}/bad-case`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, note: note ?? null }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { code: number; message?: string };
  if (json.code !== 200) throw new Error(json.message ?? 'Bad Case 标注失败');
}

export async function transferToAi(
  ticketId: string,
  agentId: string = 'A001',
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tickets/${ticketId}/transfer-ai`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { code: number; message?: string };
  if (json.code !== 200) throw new Error(json.message ?? '转回AI失败');
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export async function fetchSuggestions(ticketId: string): Promise<string[]> {
  if (USE_MOCK) {
    const { AI_SUGGESTIONS } = await import('../mocks/messages');
    return AI_SUGGESTIONS.map((s) => s.text);
  }
  try {
    const res = await fetch(`${API_BASE}/v1/tickets/${ticketId}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'A001' }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { suggestions?: string[] } };
    return json.data?.suggestions ?? [];
  } catch {
    return [];
  }
}
