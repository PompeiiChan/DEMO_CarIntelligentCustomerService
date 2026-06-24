import { useState, useCallback, useRef, useEffect } from 'react';
import styles from './Knowledge.module.css';
import { MOCK_DOCUMENTS, STATS } from '../../mocks/documents';
import type { MockDocument } from '../../mocks/documents';
import KnowledgeSidebar from './KnowledgeSidebar';
import DocumentTable from './DocumentTable';
import SearchModal from './SearchModal';
import { USE_MOCK } from '../../lib/config';
import {
  fetchDocuments,
  uploadDocument as apiUploadDocument,
  deleteDocument as apiDeleteDocument,
  fetchDocumentStatus,
} from '../../services/knowledgeService';
import type { DocumentListItem } from '../../services/knowledgeService';

type SortKey = 'time' | 'name' | 'cat';

let _nextId = 100;

// ---------------------------------------------------------------------------
// Map real API doc to MockDocument shape (field-compatible)
// ---------------------------------------------------------------------------
function toMockDoc(item: DocumentListItem): MockDocument {
  return {
    doc_id: item.doc_id,
    filename: item.filename,
    category: item.category as MockDocument['category'],
    status: item.status as MockDocument['status'],
    chunk_count: item.chunk_count,
    qa_count: item.qa_count,
    file_size: item.file_size,
    created_at: item.created_at
      ? new Date(item.created_at).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—',
  };
}

// ---------------------------------------------------------------------------
// Toast hook
// ---------------------------------------------------------------------------
function useToast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, duration = 2200) => {
    setMsg(text);
    setShow(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), duration);
  }, []);

  return { msg, show, showToast };
}

// ---------------------------------------------------------------------------
// Sort helper
// ---------------------------------------------------------------------------
function sortDocs(docs: MockDocument[], sortKey: SortKey): MockDocument[] {
  return [...docs].sort((a, b) => {
    if (sortKey === 'name') return a.filename.localeCompare(b.filename, 'zh-CN');
    if (sortKey === 'cat') return a.category.localeCompare(b.category, 'zh-CN');
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Live stats derived from docs list
// ---------------------------------------------------------------------------
function computeStats(docs: MockDocument[]) {
  const total = docs.length;
  const indexed = docs.filter(d => d.status === 'indexed').length;
  const chunks = docs.reduce((s, d) => s + (d.chunk_count ?? 0), 0);
  const qaCount = docs.reduce((s, d) => s + (d.qa_count ?? 0), 0);
  return { total, indexed, chunks, qaCount };
}

export default function Knowledge() {
  const [docs, setDocs] = useState<MockDocument[]>(USE_MOCK ? MOCK_DOCUMENTS : []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [showSearch, setShowSearch] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const { msg: toastMsg, show: toastShow, showToast } = useToast();

  // Polling refs: map of doc_id → interval handle
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ---------------------------------------------------------------------------
  // Real API: polling helpers (defined before initial load so it can be used there)
  // ---------------------------------------------------------------------------
  const startPolling = useCallback((docId: string) => {
    if (pollingRefs.current.has(docId)) return;
    const handle = setInterval(async () => {
      try {
        const status = await fetchDocumentStatus(docId);
        setDocs(prev =>
          prev.map(d => {
            if (d.doc_id !== docId) return d;
            const updated: MockDocument = {
              ...d,
              status: status.status as MockDocument['status'],
              chunk_count:
                status.steps.find(s => s.step === 1 && s.status === 'done')
                  ? parseInt(status.steps[0].detail ?? '0', 10) || d.chunk_count
                  : d.chunk_count,
              qa_count:
                status.status === 'indexed'
                  ? status.steps.find(s => s.step === 4)
                    ? parseInt(status.steps[3].detail ?? '0', 10) || d.qa_count
                    : d.qa_count
                  : d.qa_count,
            };
            return updated;
          }),
        );
        if (status.status !== 'processing') {
          clearInterval(handle);
          pollingRefs.current.delete(docId);
          if (status.status === 'indexed') {
            showToast('文档已成功入库');
          } else if (status.status === 'failed') {
            showToast('文档处理失败，请重试');
          }
        }
      } catch {
        // 轮询失败静默，不中断
      }
    }, 2000);
    pollingRefs.current.set(docId, handle);
  }, [showToast]);

  // Cleanup polling on unmount
  useEffect(() => {
    const activePollingRefs = pollingRefs.current;
    return () => {
      activePollingRefs.forEach(h => clearInterval(h));
      activePollingRefs.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Real API: initial load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (USE_MOCK) return;
    fetchDocuments({ sort: 'created_desc', page: 1, page_size: 100 })
      .then(data => {
        const mapped = data.items.map(toMockDoc);
        setDocs(mapped);
        // Start polling for any docs already in processing state
        mapped.forEach(d => {
          if (d.status === 'processing') startPolling(d.doc_id);
        });
      })
      .catch(err => setLoadError(String(err)));
  }, [startPolling]);

  // Filtered + sorted docs
  const filteredDocs = sortDocs(
    docs.filter(d => {
      const catMatch = activeCategory === '全部' || d.category === activeCategory;
      const nameMatch = d.filename.toLowerCase().includes(searchQuery.toLowerCase());
      return catMatch && nameMatch;
    }),
    sortKey,
  );

  const liveStats = USE_MOCK ? STATS : computeStats(docs);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleView = useCallback((doc: MockDocument) => {
    showToast(`正在打开文档预览：${doc.filename}`);
  }, [showToast]);

  const handleDelete = useCallback(async (doc: MockDocument) => {
    const confirmed = window.confirm(
      `确认删除「${doc.filename}」？\n删除后向量片段和 QA 条目将一并移除，不可恢复。`,
    );
    if (!confirmed) return;

    if (USE_MOCK) {
      setDocs(prev => prev.filter(d => d.doc_id !== doc.doc_id));
      showToast(`已删除 ${doc.filename}`);
      return;
    }

    try {
      await apiDeleteDocument(doc.doc_id);
      setDocs(prev => prev.filter(d => d.doc_id !== doc.doc_id));
      showToast(`已删除 ${doc.filename}`);
    } catch (err) {
      showToast(`删除失败：${String(err)}`);
    }
  }, [showToast]);

  const handleRetry = useCallback((doc: MockDocument) => {
    setDocs(prev =>
      prev.map(d =>
        d.doc_id === doc.doc_id ? { ...d, status: 'processing' as const } : d,
      ),
    );
    if (!USE_MOCK) startPolling(doc.doc_id);
    showToast(`已重新提交处理：${doc.filename}`);
  }, [showToast, startPolling]);

  const handleFileUpload = useCallback(async (files: File[]) => {
    const valid = files.filter(f => f.name.endsWith('.md'));
    if (valid.length === 0) { showToast('仅支持 .md 格式文件'); return; }

    if (USE_MOCK) {
      const newDocs: MockDocument[] = valid.map(file => ({
        doc_id: `upload-${++_nextId}`,
        filename: file.name,
        category: '保养' as const,
        status: 'processing' as const,
        chunk_count: null,
        qa_count: null,
        file_size: file.size,
        created_at: '刚刚',
      }));
      setDocs(prev => [...newDocs, ...prev]);
      showToast(`已选择 ${valid.length} 个文件，即将开始处理…`, 3000);
      newDocs.forEach(doc => {
        setTimeout(() => {
          setDocs(prev =>
            prev.map(d =>
              d.doc_id === doc.doc_id
                ? { ...d, status: 'indexed' as const, chunk_count: 42, qa_count: 12 }
                : d,
            ),
          );
        }, 2000);
      });
      return;
    }

    // Real API mode
    showToast(`正在上传 ${valid.length} 个文件…`, 3000);
    for (const file of valid) {
      try {
        const result = await apiUploadDocument(file, '保养');
        const newDoc: MockDocument = {
          doc_id: result.doc_id,
          filename: result.filename,
          category: result.category as MockDocument['category'],
          status: 'processing',
          chunk_count: null,
          qa_count: null,
          file_size: result.file_size,
          created_at: '刚刚',
        };
        setDocs(prev => [newDoc, ...prev]);
        startPolling(result.doc_id);
      } catch (err) {
        showToast(`上传失败：${file.name}（${String(err)}）`);
      }
    }
  }, [showToast, startPolling]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    handleFileUpload(files);
    e.target.value = '';
  }, [handleFileUpload]);

  const handleJump = useCallback((docId: string) => {
    setHighlightId(docId);
    setTimeout(() => {
      const el = tableRef.current?.querySelector(`[data-docid="${docId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    setTimeout(() => setHighlightId(null), 1400);
  }, []);

  // Global ESC closes search modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSearch) setShowSearch(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showSearch]);

  return (
    <div className={styles.appShell}>
      {/* Toolbar */}
      <header className={styles.toolbar}>
        <div className={styles.tbBrand}>
          <div className={styles.tbLogo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 3.5 H13.5 L2.5 12.5 H13.5"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className={styles.tbTitle}>智能汽车客服</span>
        </div>
        <div className={styles.tbDiv} />
        <nav className={styles.tbNav}>
          <span className={styles.tbLink}>管理端</span>
          <span className={styles.tbSepC}>›</span>
          <span className={styles.tbCur}>知识库管理</span>
        </nav>
        <div className={styles.tbSpacer} />
        <button
          className={`${styles.tbBtn} ${styles.tbBtnGhost}`}
          onClick={() => setShowSearch(true)}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          搜索文档
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </header>

      <div className={styles.workspace}>
        {/* Left sidebar */}
        <KnowledgeSidebar
          docs={docs}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />

        {/* Main content */}
        <main className={styles.main}>
          {/* Stats bar */}
          <div className={styles.statsBar}>
            <div className={styles.statItem}>
              <div className={`${styles.statN} ${styles.statNBlue}`}>{liveStats.total}</div>
              <div className={styles.statL}>文档总数</div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statN} ${styles.statNTeal}`}>{liveStats.chunks.toLocaleString()}</div>
              <div className={styles.statL}>向量片段</div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statN} ${styles.statNPurple}`}>{liveStats.qaCount.toLocaleString()}</div>
              <div className={styles.statL}>QA 条目</div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statN} ${styles.statNGreen}`}>{liveStats.indexed}</div>
              <div className={styles.statL}>已入库</div>
            </div>
            <div className={styles.statSpacer}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {USE_MOCK ? '最近更新：2 分钟前' : `共 ${docs.length} 条记录`}
              </span>
            </div>
          </div>

          {loadError && (
            <div style={{ color: 'var(--text-error, #FF3B30)', padding: '8px 16px', fontSize: 13 }}>
              加载失败：{loadError}
            </div>
          )}

          <div className={styles.content}>
            {/* Upload drop zone */}
            <div
              className={styles.uploadZone}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const files = [...e.dataTransfer.files].filter(f => f.name.endsWith('.md'));
                handleFileUpload(files);
              }}
            >
              <div className={styles.uploadIcon}>
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M20 28V12M20 12L14 18M20 12L26 18"
                    stroke="#8E8E93"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M8 30h24" stroke="#8E8E93" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className={styles.uploadTitle}>拖拽 Markdown 文件至此，或点击上传</div>
              <div className={styles.uploadSub}>
                仅支持 <span className={styles.uploadSubStrong}>.md 格式</span>，单文件最大 10MB
              </div>
            </div>

            {/* Action row */}
            <div className={styles.actionRow}>
              <div className={styles.searchWrap}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="#8E8E93" strokeWidth="1.4" />
                  <path d="M9.5 9.5L12 12" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  className={styles.searchInp}
                  placeholder="搜索文档名称…"
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className={styles.arSpacer} />
              <select
                className={styles.sortSel}
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
              >
                <option value="time">按上传时间排序</option>
                <option value="name">按文档名称排序</option>
                <option value="cat">按分类排序</option>
              </select>
            </div>

            {/* Document table */}
            <div ref={tableRef}>
              <DocumentTable
                docs={filteredDocs}
                highlightId={highlightId}
                onView={handleView}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Search modal */}
      {showSearch && (
        <SearchModal
          docs={docs}
          onClose={() => setShowSearch(false)}
          onJump={handleJump}
        />
      )}

      {/* Toast */}
      <div className={`${styles.toast} ${toastShow ? styles.toastShow : ''}`}>
        {toastMsg}
      </div>
    </div>
  );
}
