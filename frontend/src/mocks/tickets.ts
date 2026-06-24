export type TicketStatus = 'pending' | 'processing' | 'completed' | 'resolved';
export type TicketPriority = 'high' | 'medium' | 'low';
export type TicketCategory = '售前' | '售后';
export type TicketEmotion = 'negative' | 'neutral' | 'positive';

/** API 契约字段子集（对应 api-contracts.md 2.1 工单列表条目，全部使用 snake_case） */
export interface MockTicket {
  ticket_id: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  emotion: TicketEmotion;
  transfer_reason: string;
  preview: string;
  wait_seconds: number;
  round: number;
  created_at: string;
  agent_id?: string;
}

/** UI 渲染辅助数据，非 API 字段，前端内部使用 */
export interface TicketUIMeta {
  avChar: string;
  avColor: string;
  userName: string;
  agentName?: string;
}

/** 工单 UI 辅助 Map，通过 ticket_id 索引 */
export const TICKET_UI_META: Record<string, TicketUIMeta> = {
  T20250609003: { avChar: '陈', avColor: 'linear-gradient(135deg,#FF3B30,#FF6B6B)', userName: '陈先生' },
  T20250609001: { avChar: '李', avColor: 'linear-gradient(135deg,#0066CC,#0085FF)', userName: '李先生' },
  T20250609002: { avChar: '王', avColor: 'linear-gradient(135deg,#5E5CE6,#7B79F7)', userName: '王女士' },
  T20250609004: { avChar: '赵', avColor: 'linear-gradient(135deg,#28CD41,#34D058)', userName: '赵先生' },
  T20250609000: { avChar: '林', avColor: 'linear-gradient(135deg,#FF9500,#FFAD33)', userName: '林女士', agentName: '张三' },
};

/** 默认 UI Meta，当 ticket_id 不在 TICKET_UI_META 中时使用 */
export const DEFAULT_TICKET_UI_META: TicketUIMeta = {
  avChar: '客',
  avColor: 'linear-gradient(135deg,#6B7280,#9CA3AF)',
  userName: '用户',
};

export const MOCK_TICKETS: MockTicket[] = [
  {
    ticket_id: 'T20250609003', status: 'pending', priority: 'high',
    category: '售后', emotion: 'negative', transfer_reason: '情绪负面',
    preview: '这车太垃圾了，刚买两个月就出毛病，服务态度也太差了！',
    wait_seconds: 50, round: 2, created_at: '2025-06-09T09:58:00Z',
  },
  {
    ticket_id: 'T20250609001', status: 'pending', priority: 'high',
    category: '售后', emotion: 'neutral', transfer_reason: '连续3次未匹配',
    preview: '极氪 001 底盘异响，低速行驶有嗡嗡声，怀疑传动轴问题',
    wait_seconds: 80, round: 5, created_at: '2025-06-09T09:59:00Z',
  },
  {
    ticket_id: 'T20250609002', status: 'pending', priority: 'medium',
    category: '售前', emotion: 'neutral', transfer_reason: '用户要求',
    preview: '极氪 001 最新报价是多少？和极氪 007 比哪个更值得买？',
    wait_seconds: 225, round: 3, created_at: '2025-06-09T10:00:00Z',
  },
  {
    ticket_id: 'T20250609004', status: 'pending', priority: 'low',
    category: '售后', emotion: 'neutral', transfer_reason: '连续3次未匹配',
    preview: '家用充电桩安装后充电速度异常，最高只有 7kW',
    wait_seconds: 302, round: 4, created_at: '2025-06-09T10:01:00Z',
  },
  {
    ticket_id: 'T20250609000', status: 'processing', priority: 'medium',
    category: '售前', emotion: 'neutral', transfer_reason: '用户要求',
    preview: '想了解极氪 Mix 的第二排座椅是否可以全平，长途睡觉够不够宽敞',
    wait_seconds: 0, round: 6, created_at: '2025-06-09T09:55:00Z',
    agent_id: 'A001',
  },
];
