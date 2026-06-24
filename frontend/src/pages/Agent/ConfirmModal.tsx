import styles from './Agent.module.css';

export type ModalType = 'accept' | 'end' | 'transfer' | 'badcase';

interface ConfirmModalProps {
  type: ModalType;
  ticketId: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const CONFIG = {
  accept: {
    icon: '✅',
    iconClass: styles.modalIconBlue,
    title: '确认接单？',
    desc: (id: string) =>
      `工单 ${id} 将进入服务中状态，您将开始为该用户服务。`,
  },
  end: {
    icon: '⏹',
    iconClass: styles.modalIconRed,
    title: '结束本次服务？',
    desc: (id: string) =>
      `工单 ${id} 将归档为「已结束」，无法继续发送消息。`,
  },
  transfer: {
    icon: '🤖',
    iconClass: styles.modalIconBlue,
    title: '将对话转回 AI 客服？',
    desc: (id: string) =>
      `工单 ${id} 将由 AI 接管，您将退出本次服务。`,
  },
  badcase: {
    icon: '🚩',
    iconClass: styles.modalIconOrange,
    title: '标记为 Bad Case？',
    desc: () =>
      '本对话将进入质检复核队列，用于模型迭代优化。标记后不可撤销。',
  },
};

export default function ConfirmModal({
  type,
  ticketId,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const cfg = CONFIG[type];

  return (
    <div className={styles.modalBackdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={`${styles.modalIcon} ${cfg.iconClass}`}>{cfg.icon}</div>
        <div className={styles.modalTitle}>{cfg.title}</div>
        <div className={styles.modalDesc}>{cfg.desc(ticketId)}</div>
        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onCancel}>
            取消
          </button>
          <button className={styles.btnModalConfirm} onClick={onConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
