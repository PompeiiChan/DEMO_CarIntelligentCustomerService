import styles from './ChatHeader.module.css';

interface ChatHeaderProps {
  isHuman: boolean;
  ticketNo: string | null;
}

export default function ChatHeader({ isHuman, ticketNo }: ChatHeaderProps) {
  const subText = isHuman && ticketNo
    ? `工单 ${ticketNo} · 张三服务中`
    : 'AI 客服在线 · 全天候服务';

  return (
    <div className={styles.chatHeader}>
      <div className={styles.logoMark}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M4 5 H18 L4 17 H18"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className={styles.headerInfo}>
        <div className={styles.headerTitle}>智能汽车客服</div>
        <div className={styles.headerSub}>
          <div
            className={`${styles.headerSubDot} ${
              isHuman ? styles.headerSubDotHuman : styles.headerSubDotAi
            }`}
          />
          <span className={styles.headerSubText}>{subText}</span>
        </div>
      </div>

      <div
        className={`${styles.svcBadge} ${
          isHuman ? styles.svcBadgeHuman : styles.svcBadgeAi
        }`}
      >
        {isHuman ? '人工客服' : 'AI 客服'}
      </div>

      <button className={styles.hdrMenu} aria-label="更多选项">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="3" r="1.4" fill="#636366" />
          <circle cx="8" cy="8" r="1.4" fill="#636366" />
          <circle cx="8" cy="13" r="1.4" fill="#636366" />
        </svg>
      </button>
    </div>
  );
}
