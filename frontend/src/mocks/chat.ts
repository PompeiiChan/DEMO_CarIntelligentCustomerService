/** API 契约字段子集（对应 api-contracts.md 1.3 history 条目） */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** 前端 UI 内部使用的消息类型，包含 React key 及 UI 专用角色 */
export interface UIChatMessage {
  _uiId: string;           // React key，非 API 字段
  role: 'user' | 'assistant' | 'agent' | 'system';
  content: string;
  timestamp: string;
}

/** API 契约字段子集（对应 api-contracts.md 1.2 transfer 消息） */
export interface TransferEvent {
  ticket_id: string;
  transfer_reason: string;
  queue_position: number;
}

export const AI_REPLY_RULES: Array<{
  keywords: string[];
  reply: string;
  transfer?: boolean;
}> = [
  {
    keywords: ['价格', '报价', '多少钱', '优惠'],
    reply:
      '目前极氪 001 起售价 26.90 万，极氪 007 起售价 20.99 万，极氪 Mix 起售价 24.99 万。如需最新优惠，建议联系当地门店。',
  },
  {
    keywords: ['续航', '里程', '充电', '电池', '快充'],
    reply:
      '极氪 001 最长续航 870km（CLTC），支持 800V 超快充，10→80% 约 26 分钟。',
  },
  {
    keywords: ['保养', '保修', '质保', '维保'],
    reply:
      '极氪提供 4 年或 12 万公里整车质保，动力电池 8 年或 16 万公里质保。',
  },
  {
    keywords: ['试驾', '预约'],
    reply:
      '可通过极氪 App 或官网预约试驾，通常当日即可安排。请问您在哪个城市？',
  },
  {
    keywords: ['异响', '噪音', '嗡嗡', '底盘', '故障', '坏了'],
    reply:
      '针对车辆异响问题，建议前往极氪服务中心进行专业检测。如情况紧急，可转接人工客服进一步跟进。',
  },
  {
    keywords: ['人工', '客服', '转接', '真人'],
    reply: '好的，正在为您连接人工客服，请稍候…',
    transfer: true,
  },
  {
    keywords: ['极氪', '车型', '配置', '001', '007', 'mix', 'Mix'],
    reply:
      '极氪目前主销三款：001（旗舰轿跑 SUV）、007（中大型轿车）、Mix（家用 MPV）。请问您最感兴趣哪款？',
  },
  {
    keywords: ['谢谢', '感谢', '好的', '明白', '了解'],
    reply: '不客气！如还有其他问题随时可以问我 😊',
  },
];

export const FALLBACK_REPLIES = [
  '您的问题我已记录，正在知识库检索中，请稍候…\n\n如未找到满意答案，可点击「人工客服」获得进一步帮助。',
  '感谢您的咨询。这个问题建议联系人工客服或预约到店检查。',
  '关于您提到的问题，建议拨打极氪 400-818-0818 热线，或前往最近服务中心。需要帮您查询附近网点吗？',
];

export const QUICK_ACTIONS = [
  { emoji: '🚗', label: '车型咨询' },
  { emoji: '💰', label: '价格查询' },
  { emoji: '🗓', label: '试驾预约' },
  { emoji: '🔧', label: '保养咨询' },
  { emoji: '🛠', label: '维修咨询' },
  { emoji: '🆘', label: '道路救援' },
];
