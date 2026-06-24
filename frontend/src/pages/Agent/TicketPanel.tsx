import styles from './Agent.module.css';
import type { MockTicket } from '../../mocks/tickets';

interface TicketPanelProps {
  ticket: MockTicket | null;
  isBadCaseMarked: boolean;
  onTransfer: () => void;
  onBadCase: () => void;
  onEnd: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TicketPanel({
  ticket,
  isBadCaseMarked,
  onTransfer,
  onBadCase,
  onEnd,
}: TicketPanelProps) {
  return (
    <>
      <div className={styles.srHeader}>工单详情</div>

      {!ticket ? (
        <div className={styles.srEmpty}>请选择工单查看详情</div>
      ) : (
        <>
          <div className={styles.srBody}>
            <div className={styles.infoCard}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>工单号</span>
                <span className={styles.infoValue} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  {ticket.ticket_id}
                </span>
              </div>
              <hr className={styles.infoSep} />
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>创建时间</span>
                <span className={styles.infoValue} style={{ fontSize: 12 }}>
                  {formatDate(ticket.created_at)}
                </span>
              </div>
              <hr className={styles.infoSep} />
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>优先级</span>
                <span className={styles.infoValue}>
                  {ticket.priority === 'high' ? '🔴 高' : ticket.priority === 'medium' ? '🟡 中' : '🟢 低'}
                </span>
              </div>
              <hr className={styles.infoSep} />
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>分类</span>
                <span className={styles.infoValue}>{ticket.category}</span>
              </div>
              <hr className={styles.infoSep} />
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>情绪</span>
                <span className={styles.infoValue}>
                  {ticket.emotion === 'negative' ? '😤 负面' : ticket.emotion === 'positive' ? '😊 正面' : '😐 中性'}
                </span>
              </div>
              <hr className={styles.infoSep} />
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>转接原因</span>
                <span className={styles.infoValue}>{ticket.transfer_reason}</span>
              </div>
              <hr className={styles.infoSep} />
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>对话轮数</span>
                <span className={styles.infoValue}>{ticket.round} 轮</span>
              </div>
            </div>
          </div>

          <div className={styles.srActions}>
            <button
              className={`${styles.btnAction} ${styles.btnActionBlue}`}
              onClick={onTransfer}
            >
              ↩ 转回 AI 客服
            </button>
            <button
              className={`${styles.btnAction} ${
                isBadCaseMarked ? styles.btnActionOrangeMarked : styles.btnActionOrange
              }`}
              onClick={isBadCaseMarked ? undefined : onBadCase}
            >
              {isBadCaseMarked ? '✓ 已标注 Bad Case' : '🚩 标注 Bad Case'}
            </button>
            <button
              className={`${styles.btnAction} ${styles.btnActionRed}`}
              onClick={onEnd}
            >
              ⏹ 结束工单
            </button>
          </div>
        </>
      )}
    </>
  );
}
