export type DocStatus = 'indexed' | 'processing' | 'failed';
export type DocCategory = '车型' | '价格' | '保养' | '维修' | '政策';

/** API 契约字段子集（对应 api-contracts.md 5.1 文档列表条目，全部使用 snake_case） */
export interface MockDocument {
  doc_id: string;
  filename: string;
  category: DocCategory;
  status: DocStatus;
  chunk_count: number | null;
  qa_count: number | null;
  file_size: number;
  created_at: string;
}

/** UI 渲染辅助数据，非 API 字段，前端内部使用 */
export const DOC_ERROR_HINT: Record<string, string> = {
  d008: '格式错误',
};

export const MOCK_DOCUMENTS: MockDocument[] = [
  { doc_id: 'd001', filename: '极氪 001 技术规格手册.md', category: '车型', status: 'indexed', chunk_count: 234, qa_count: 45, file_size: 48000, created_at: '2小时前' },
  { doc_id: 'd002', filename: '极氪 007 用户使用指南.md', category: '车型', status: 'indexed', chunk_count: 189, qa_count: 38, file_size: 38000, created_at: '3小时前' },
  { doc_id: 'd003', filename: '极氪 Mix 产品介绍与参数.md', category: '车型', status: 'indexed', chunk_count: 156, qa_count: 29, file_size: 32000, created_at: '昨天' },
  { doc_id: 'd004', filename: '全系车型配置对比表.md', category: '车型', status: 'indexed', chunk_count: 98, qa_count: 21, file_size: 20000, created_at: '昨天' },
  { doc_id: 'd005', filename: '极氪全系保养周期与费用.md', category: '保养', status: 'indexed', chunk_count: 67, qa_count: 22, file_size: 14000, created_at: '3天前' },
  { doc_id: 'd006', filename: '新能源车充电桩安装指南.md', category: '保养', status: 'processing', chunk_count: null, qa_count: null, file_size: 28000, created_at: '刚刚' },
  { doc_id: 'd007', filename: '常见故障排查与处理手册.md', category: '维修', status: 'indexed', chunk_count: 312, qa_count: 89, file_size: 64000, created_at: '3天前' },
  { doc_id: 'd008', filename: '售后服务价格政策 2024.md', category: '政策', status: 'failed', chunk_count: null, qa_count: null, file_size: 18000, created_at: '5天前' },
];

export const CATEGORIES: DocCategory[] = ['车型', '价格', '保养', '维修', '政策'];

export const STATS = {
  total: 14,
  chunks: 2847,
  qaCount: 523,
  indexed: 12,
};
