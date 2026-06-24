import styles from './Knowledge.module.css';
import type { MockDocument, DocCategory } from '../../mocks/documents';
import { DOC_ERROR_HINT } from '../../mocks/documents';

interface Props {
  docs: MockDocument[];
  highlightId: string | null;
  onView: (doc: MockDocument) => void;
  onDelete: (doc: MockDocument) => void;
  onRetry: (doc: MockDocument) => void;
}

const CAT_CLASS: Record<DocCategory, string> = {
  车型: styles.ctModel,
  价格: styles.ctPrice,
  保养: styles.ctMaint,
  维修: styles.ctRepair,
  政策: styles.ctPolicy,
};

export default function DocumentTable({ docs, highlightId, onView, onDelete, onRetry }: Props) {
  return (
    <div className={styles.docTable}>
      <div className={styles.dtHead}>
        <div className={styles.dtTh}>文档名称</div>
        <div className={styles.dtTh}>分类</div>
        <div className={styles.dtTh}>向量片段</div>
        <div className={styles.dtTh}>QA条目</div>
        <div className={styles.dtTh}>状态</div>
        <div className={styles.dtTh}>上传时间</div>
        <div className={styles.dtTh}>操作</div>
      </div>

      {docs.length === 0 && (
        <div className={styles.dtEmpty}>暂无匹配文档</div>
      )}

      {docs.map(doc => {
        const isHighlight = doc.doc_id === highlightId;
        return (
          <div
            key={doc.doc_id}
            className={`${styles.dtRow} ${isHighlight ? styles.dtRowHighlight : ''}`}
            data-docid={doc.doc_id}
          >
            {/* 文档名称 */}
            <div className={styles.dtName}>
              <div
                className={`${styles.mdIcon} ${doc.status === 'failed' ? styles.mdIconFail : ''}`}
              >
                MD
              </div>
              <span className={styles.dtFname}>
                {doc.filename}
                {doc.status === 'failed' && DOC_ERROR_HINT[doc.doc_id] && (
                  <span className={styles.errorHint}>· {DOC_ERROR_HINT[doc.doc_id]}</span>
                )}
              </span>
            </div>

            {/* 分类 */}
            <span className={`${styles.catTag} ${CAT_CLASS[doc.category]}`}>
              {doc.category}
            </span>

            {/* 向量片段 */}
            <span className={`${styles.dtNum} ${doc.chunk_count === null ? styles.dtNumDim : ''}`}>
              {doc.chunk_count !== null ? doc.chunk_count : '—'}
            </span>

            {/* QA条目 */}
            <span className={`${styles.dtNum} ${doc.qa_count === null ? styles.dtNumDim : ''}`}>
              {doc.qa_count !== null ? doc.qa_count : '—'}
            </span>

            {/* 状态 */}
            {doc.status === 'indexed' && (
              <span className={`${styles.statusBadge} ${styles.sbOk}`}>
                <div className={styles.sbDot} />
                已入库
              </span>
            )}
            {doc.status === 'processing' && (
              <span className={`${styles.statusBadge} ${styles.sbProc}`}>
                <div className={styles.sbSpin} />
                处理中
              </span>
            )}
            {doc.status === 'failed' && (
              <span className={`${styles.statusBadge} ${styles.sbFail}`}>
                <div className={styles.sbDot} />
                处理失败
              </span>
            )}

            {/* 上传时间 */}
            <span className={styles.dtTime}>{doc.created_at}</span>

            {/* 操作 */}
            <div className={styles.dtActions}>
              {doc.status === 'indexed' && (
                <>
                  <button
                    className={`${styles.actBtn} ${styles.actView}`}
                    onClick={e => { e.stopPropagation(); onView(doc); }}
                  >
                    查看
                  </button>
                  <button
                    className={`${styles.actBtn} ${styles.actDel}`}
                    onClick={e => { e.stopPropagation(); onDelete(doc); }}
                  >
                    删除
                  </button>
                </>
              )}
              {doc.status === 'processing' && (
                <button
                  className={`${styles.actBtn} ${styles.actView} ${styles.actBtnDisabled}`}
                  disabled
                >
                  查看
                </button>
              )}
              {doc.status === 'failed' && (
                <>
                  <button
                    className={`${styles.actBtn} ${styles.actRetry}`}
                    onClick={e => { e.stopPropagation(); onRetry(doc); }}
                  >
                    重试
                  </button>
                  <button
                    className={`${styles.actBtn} ${styles.actDel}`}
                    onClick={e => { e.stopPropagation(); onDelete(doc); }}
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
