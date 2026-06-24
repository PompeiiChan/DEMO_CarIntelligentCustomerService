import styles from './TypingIndicator.module.css';

const BOT_SVG = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 3.5 H13 L3 12.5 H13"
      stroke="white"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface TypingIndicatorProps {
  isAgent?: boolean;
}

export default function TypingIndicator({ isAgent = false }: TypingIndicatorProps) {
  return (
    <div className={styles.wrapper}>
      <div className={`${styles.av} ${isAgent ? styles.avAgent : styles.avBot}`}>
        {isAgent ? '张' : BOT_SVG}
      </div>
      <div className={styles.typingBub}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
      </div>
    </div>
  );
}
