import styles from './Knowledge.module.css';
import type { MockDocument } from '../../mocks/documents';

interface Props {
  docs: MockDocument[];
}

export default function ProcessingBanner({ docs }: Props) {
  const processingDocs = docs.filter(d => d.status === 'processing');
  if (processingDocs.length === 0) return null;

  return (
    <>
      {processingDocs.map(doc => (
        <div key={doc.doc_id} className={styles.procBanner}>
          <div className={styles.procHeader}>
            <div className={styles.procSpin} />
            <span className={styles.procFilename}>{doc.filename}</span>
            <span className={styles.procSize}>
              {Math.round(doc.file_size / 1024)} KB · 刚刚上传
            </span>
            <span className={styles.procPct}>处理中 75%</span>
          </div>
          <div className={styles.pipelineSteps}>
            <div className={styles.ps}>
              <div className={styles.psNum}>步骤 1</div>
              <div className={styles.psName}>文档切片</div>
              <div className={styles.psDesc}>按段落分块，chunk_size=500，overlap=50</div>
              <span className={`${styles.psStatus} ${styles.psStatusDone}`}>
                <div className={styles.psStatusDot} />
                已完成 · 42 片段
              </span>
            </div>
            <div className={styles.ps}>
              <div className={styles.psNum}>步骤 2</div>
              <div className={styles.psName}>向量化入库</div>
              <div className={styles.psDesc}>Embedding 模型编码，写入向量库（SQLite）</div>
              <span className={`${styles.psStatus} ${styles.psStatusRunning}`}>
                <div className={styles.psRunSpin} />
                进行中 · 31/42
              </span>
            </div>
            <div className={styles.ps}>
              <div className={styles.psNum}>步骤 3</div>
              <div className={styles.psName}>元数据提取</div>
              <div className={styles.psDesc}>提取标题、关键词，写入元数据库（SQLite）</div>
              <span className={`${styles.psStatus} ${styles.psStatusWait}`}>
                <div className={styles.psStatusDot} />
                等待中
              </span>
            </div>
            <div className={styles.ps}>
              <div className={styles.psNum}>步骤 4</div>
              <div className={styles.psName}>QA 自动提取</div>
              <div className={styles.psDesc}>LLM 自动生成 QA 对，写入 QA 库（SQLite）</div>
              <span className={`${styles.psStatus} ${styles.psStatusWait}`}>
                <div className={styles.psStatusDot} />
                等待中
              </span>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
