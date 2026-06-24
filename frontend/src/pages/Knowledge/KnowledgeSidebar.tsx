import styles from './Knowledge.module.css';
import { CATEGORIES, STATS } from '../../mocks/documents';
import type { DocCategory, MockDocument } from '../../mocks/documents';

interface Props {
  docs: MockDocument[];
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}

const CAT_COLORS: Record<string, string> = {
  全部: '#0066CC',
  车型: '#0066CC',
  价格: '#32ADE6',
  保养: '#28CD41',
  维修: '#FF9500',
  政策: '#5E5CE6',
};

export default function KnowledgeSidebar({ docs, activeCategory, onCategoryChange }: Props) {
  const countFor = (cat: DocCategory) => docs.filter(d => d.category === cat).length;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.slSec}>
        <div className={styles.slSecTitle}>文档分类</div>

        {/* 全部 */}
        <div
          className={`${styles.catRow} ${activeCategory === '全部' ? styles.catRowActive : ''}`}
          onClick={() => onCategoryChange('全部')}
        >
          <div className={styles.catDot} style={{ background: CAT_COLORS['全部'] }} />
          <span className={styles.catLabel}>全部文档</span>
          <span className={styles.catCount}>{STATS.total}</span>
        </div>

        {CATEGORIES.map(cat => (
          <div
            key={cat}
            className={`${styles.catRow} ${activeCategory === cat ? styles.catRowActive : ''}`}
            onClick={() => onCategoryChange(cat)}
          >
            <div className={styles.catDot} style={{ background: CAT_COLORS[cat] }} />
            <span className={styles.catLabel}>{cat}</span>
            <span className={styles.catCount}>{countFor(cat)}</span>
          </div>
        ))}
      </div>

      <div className={styles.slSpacer} />

      <div className={styles.slBottom}>
        <div className={styles.slStat}>
          向量片段总数
          <span className={styles.slStatVal}>
            {STATS.chunks.toLocaleString()}
          </span>
        </div>
        <div className={styles.slStat}>
          QA 条目总数
          <span className={styles.slStatVal}>
            {STATS.qaCount.toLocaleString()}
          </span>
        </div>
        <div className={styles.slStat}>
          向量库大小
          <span className={styles.slStatVal}>48 MB</span>
        </div>
      </div>
    </aside>
  );
}
