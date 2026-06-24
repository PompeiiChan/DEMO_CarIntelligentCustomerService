import { API_BASE } from '../lib/config';

// ---------------------------------------------------------------------------
// Response DTOs — aligned with api-contracts.md section 5
// ---------------------------------------------------------------------------

export interface DocumentListItem {
  doc_id: string;
  filename: string;
  category: string;
  status: 'indexed' | 'processing' | 'failed';
  chunk_count: number | null;
  qa_count: number | null;
  file_size: number;
  created_at: string;
  updated_at?: string;
  error_msg?: string | null;
}

export interface DocumentListResponse {
  items: DocumentListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface UploadDocumentResponse {
  doc_id: string;
  filename: string;
  category: string;
  status: 'processing';
  file_size: number;
}

export interface DeleteDocumentResponse {
  doc_id: string;
}

export interface PipelineStep {
  step: number;
  name: string;
  status: 'waiting' | 'running' | 'done' | 'failed';
  detail: string | null;
}

export interface DocumentStatusResponse {
  doc_id: string;
  status: 'indexed' | 'processing' | 'failed';
  progress_pct: number;
  steps: PipelineStep[];
}

// ---------------------------------------------------------------------------
// Query params for list
// ---------------------------------------------------------------------------

export interface DocumentListParams {
  category?: string;
  q?: string;
  sort?: 'created_desc' | 'name_asc' | 'category_asc';
  page?: number;
  page_size?: number;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function fetchDocuments(
  params?: DocumentListParams,
): Promise<DocumentListResponse> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.q) qs.set('q', params.q);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.page_size != null) qs.set('page_size', String(params.page_size));
  const res = await fetch(`${API_BASE}/v1/knowledge/documents?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message ?? '获取文档列表失败');
  return json.data as DocumentListResponse;
}

export async function uploadDocument(
  file: File,
  category: string,
): Promise<UploadDocumentResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  const res = await fetch(`${API_BASE}/v1/knowledge/documents`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.detail ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message ?? '上传失败');
  return json.data as UploadDocumentResponse;
}

export async function deleteDocument(docId: string): Promise<DeleteDocumentResponse> {
  const res = await fetch(`${API_BASE}/v1/knowledge/documents/${docId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message ?? '删除失败');
  return json.data as DeleteDocumentResponse;
}

export async function fetchDocumentStatus(
  docId: string,
): Promise<DocumentStatusResponse> {
  const res = await fetch(`${API_BASE}/v1/knowledge/documents/${docId}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message ?? '查询状态失败');
  return json.data as DocumentStatusResponse;
}
