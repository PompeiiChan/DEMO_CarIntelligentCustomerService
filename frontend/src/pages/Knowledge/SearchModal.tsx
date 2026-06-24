import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Knowledge.module.css';
import type { MockDocument, DocCategory } from '../../mocks/documents';

interface Props {
  docs: MockDocument[];
  onClose: () => void;
  onJump: (docId: string) => void;
}

const CAT_CLASS: Record<DocCategory, string> = {
  车型: styles.ctModel,
  价格: styles.ctPrice,
  保养: styles.ctMaint,
  维修: styles.ctRepair,
  政策: styles.ctPolicy,
};

const STATUS_LABEL: Record<string, string> = {
  indexed: '已入库',
  processing: '处理中',
  failed: '处理失败',
};

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text: string, query: string): string {
  if (!query) return text;
  const re = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

export default function SearchModal({ docs, onClose, onJump }: Props) {
  const [query, setQuery] = useState('');
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const matched = query
    ? docs.filter(d => d.filename.toLowerCase().includes(query.toLowerCase()))
    : docs;

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx(i => Math.min(matched.length - 1, i + 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx(i => Math.max(0, i - 1));
    }
    if (e.key === 'Enter' && focusIdx >= 0 && matched[focusIdx]) {
      onJump(matched[focusIdx].doc_id);
      onClose();
    }
  }, [matched, focusIdx, onClose, onJump]);

  return (
    <div className={styles.modalBackdrop} onClick={handleBackdropClick}>
      <div className={styles.searchModal}>
        <div className={styles.smInputRow}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
            <circle cx="7" cy="7" r="5" stroke="#1C1C1E" strokeWidth="1.6" />
            <path d="M11 11L14 14" stroke="#1C1C1E" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className={styles.smInp}
            placeholder="搜索文档名称…"
            autoComplete="off"
            value={query}
            onChange={e => { setQuery(e.target.value); setFocusIdx(-1); }}
            onKeyDown={handleKeyDown}
          />
          <span className={styles.smKbd}>ESC 关闭</span>
        </div>

        <div className={styles.smResults}>
          {matched.length === 0 ? (
            <div className={styles.smEmpty}>
              {query ? `未找到包含「${query}」的文档` : '暂无文档'}
            </div>
          ) : (
            matched.map((doc, i) => (
              <div
                key={doc.doc_id}
                className={`${styles.smResult} ${i === focusIdx ? styles.smResultFocused : ''}`}
                onClick={() => { onJump(doc.doc_id); onClose(); }}
                onMouseEnter={() => setFocusIdx(i)}
              >
                <div className={styles.smResultIcon}>MD</div>
                <div className={styles.smResultInfo}>
                  <div
                    className={styles.smResultName}
                    dangerouslySetInnerHTML={{ __html: highlight(doc.filename, query) }}
                  />
                  <div className={styles.smResultMeta}>{STATUS_LABEL[doc.status]}</div>
                </div>
                <span className={`${styles.catTag} ${CAT_CLASS[doc.category]}`}>
                  {doc.category}
                </span>
              </div>
            ))
          )}
        </div>

        <div className={styles.smHint}>
          <span><kbd>↑</kbd><kbd>↓</kbd> 导航</span>
          <span><kbd>↵</kbd> 跳转</span>
          <span><kbd>ESC</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
