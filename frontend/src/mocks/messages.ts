/** API 契约字段子集（对应 api-contracts.md 2.2 history 条目 + 3.x 消息）。
 *  role 'agent'/'system'：坐席/系统消息，前端 UI 专用角色，不映射到 api-contracts history role。
 */
export interface MockMessage {
  role: 'user' | 'assistant' | 'agent' | 'system';
  content: string;
  timestamp: string;
}

export const MOCK_HISTORY: Record<string, MockMessage[]> = {
  T20250609000: [
    { role: 'assistant', content: '您好！我是极氪智能客服，请问有什么可以帮助您？', timestamp: '09:55' },
    { role: 'user', content: '我想了解极氪 Mix 的第二排座椅能不能全平，长途睡觉够不够宽敞？', timestamp: '09:55' },
    { role: 'assistant', content: '极氪 MIX 后排支持零重力模式，靠背可调至约 135°，坐垫延伸后横向宽约 1.45m，成人平躺完全没问题，长途非常舒适。', timestamp: '09:56' },
    { role: 'user', content: '那和其他家用 MPV 比有什么优势？', timestamp: '09:56' },
    { role: 'assistant', content: '和传统 MPV 相比，MIX 还具备纯电平台、大五门无 B 柱设计……相关参数我这边有限，帮您转接专业顾问进一步解答好吗？', timestamp: '09:57' },
    { role: 'user', content: '好的，麻烦了', timestamp: '09:57' },
  ],
  T20250609001: [
    { role: 'assistant', content: '您好！我是极氪智能客服，请问有什么可以帮助您？', timestamp: '11:45' },
    { role: 'user', content: '我的车底盘有异响', timestamp: '11:45' },
    { role: 'assistant', content: '请问您的车型是？', timestamp: '11:46' },
    { role: 'user', content: '极氪 001', timestamp: '11:46' },
    { role: 'assistant', content: '请问异响在什么场景下出现？低速行驶时？高速时？还是加速时？', timestamp: '11:47' },
    { role: 'user', content: '低速行驶有嗡嗡声', timestamp: '11:47' },
    { role: 'assistant', content: '抱歉，暂时没有找到匹配方案，正在为您转接人工客服，请稍候...', timestamp: '11:48' },
  ],
  T20250609002: [
    { role: 'assistant', content: '您好！我是极氪智能客服，请问有什么可以帮助您？', timestamp: '11:45' },
    { role: 'user', content: '极氪 001 和 007 哪个更值得买？主要看价格和续航', timestamp: '11:45' },
    { role: 'assistant', content: '好的，两款车各有侧重。请问您更偏向轿跑风格还是轿车？另外您的预算大概在哪个区间？', timestamp: '11:46' },
  ],
  T20250609003: [
    { role: 'user', content: '这车太垃圾了！刚买两个月就出毛病，你们售后态度也太差了！', timestamp: '09:58' },
    { role: 'assistant', content: '很抱歉给您带来不好的体验，已为您优先转接人工客服。', timestamp: '09:58' },
  ],
  T20250609004: [
    { role: 'assistant', content: '您好！我是极氪智能客服，请问有什么可以帮助您？', timestamp: '11:50' },
    { role: 'user', content: '家用充电桩安装后充电速度异常，最高只有 7kW', timestamp: '11:51' },
    { role: 'assistant', content: '请问您使用的是极氪官方充电桩还是第三方？', timestamp: '11:51' },
    { role: 'user', content: '极氪官方的', timestamp: '11:52' },
  ],
};

export const AI_SUGGESTIONS = [
  { id: 's1', text: '您好！我是客服张三，已查看您反馈的问题。建议您预约到店进行专业检测，我们的技师会为您仔细排查。' },
  { id: 's2', text: '非常抱歉给您带来困扰！您的问题我已记录，会为您优先安排处理，预计 24 小时内回复。' },
];
