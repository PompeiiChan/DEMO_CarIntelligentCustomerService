import type { UIChatMessage as ChatMessage } from '../../mocks/chat';
import styles from './MessageBubble.module.css';

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

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, timestamp } = message;

  if (role === 'system') {
    const pillClass =
      content.includes('工单') && content.includes('已创建')
        ? styles.sysPillOrange
        : content.includes('已接入')
        ? styles.sysPillBlue
        : styles.sysPillNeutral;

    return (
      <div className={styles.msgGroupSys}>
        <div className={`${styles.sysPill} ${pillClass}`}>
          <div className={styles.spDot} />
          {content}
        </div>
      </div>
    );
  }

  if (role === 'user') {
    return (
      <div className={`${styles.msgGroup} ${styles.msgGroupUser} ${styles.turnGap}`}>
        <div className={styles.bc}>
          <div className={`${styles.bubble} ${styles.bubbleUser}`}>{content}</div>
          <div className={styles.bubbleTimestamp}>{timestamp}</div>
        </div>
        <div className={`${styles.av} ${styles.avGhost}`} />
      </div>
    );
  }

  // assistant or agent
  const isAgent = role === 'agent';
  return (
    <div className={`${styles.msgGroup} ${styles.msgGroupAi} ${styles.turnGap}`}>
      <div className={`${styles.av} ${isAgent ? styles.avAgent : styles.avBot}`}>
        {isAgent ? '张' : BOT_SVG}
      </div>
      <div className={styles.bc}>
        <div className={`${styles.bubble} ${styles.bubbleAi}`}>{content}</div>
        <div className={styles.bubbleTimestamp}>{timestamp}</div>
      </div>
    </div>
  );
}
