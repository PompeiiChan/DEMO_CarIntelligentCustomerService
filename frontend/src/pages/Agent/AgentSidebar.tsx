import { useState } from 'react';
import styles from './Agent.module.css';
import type { MockTicket } from '../../mocks/tickets';
import { TICKET_UI_META, DEFAULT_TICKET_UI_META } from '../../mocks/tickets';

type TabType = 'pending' | 'serving' | 'ended';

interface EndedTicket extends MockTicket {
  endType?: 'done' | 'ai';
}

interface AgentSidebarProps {
  pendingTickets: MockTicket[];
  servingTickets: MockTicket[];
  endedTickets: EndedTicket[];
  selectedTicketId: string | null;
  previewTicketId: string | null;
  onTicketClick: (ticket: MockTicket, tab: TabType) => void;
}

function formatWait(secs: number): string {
  if (secs < 60) return `等待 ${secs}s`;
  return `等待 ${Math.floor(secs / 60)}m${secs % 60}s`;
}

function PriorityBadge({ priority }: { priority: MockTicket['priority'] }) {
  const cls =
    priority === 'high'
      ? styles.badgeHigh
      : priority === 'medium'
      ? styles.badgeMedium
      : styles.badgeLow;
  const label = priority === 'high' ? '高' : priority === 'medium' ? '中' : '低';
  return <span className={`${styles.cardBadge} ${cls}`}>{label}</span>;
}

export default function AgentSidebar({
  pendingTickets,
  servingTickets,
  endedTickets,
  selectedTicketId,
  previewTicketId,
  onTicketClick,
}: AgentSidebarProps) {
  const [tab, setTab] = useState<TabType>('pending');

  return (
    <>
      <div className={styles.slTabs}>
        <div
          className={`${styles.slTab} ${tab === 'pending' ? styles.slTabActive : ''}`}
          onClick={() => setTab('pending')}
        >
          待接手 {pendingTickets.length}
        </div>
        <div
          className={`${styles.slTab} ${tab === 'serving' ? styles.slTabActive : ''}`}
          onClick={() => setTab('serving')}
        >
          服务中 {servingTickets.length}
        </div>
        <div
          className={`${styles.slTab} ${tab === 'ended' ? styles.slTabActive : ''}`}
          onClick={() => setTab('ended')}
        >
          已结束 {endedTickets.length}
        </div>
      </div>

      <div className={styles.slList}>
        {tab === 'pending' &&
          pendingTickets.map((t) => {
            const uiMeta = TICKET_UI_META[t.ticket_id] ?? DEFAULT_TICKET_UI_META;
            return (
              <div
                key={t.ticket_id}
                className={`${styles.ticketCard} ${
                  previewTicketId === t.ticket_id ? styles.ticketCardActive : ''
                }`}
                onClick={() => onTicketClick(t, 'pending')}
              >
                <div className={styles.cardHeader}>
                  <div
                    className={styles.cardAvatar}
                    style={{ background: uiMeta.avColor }}
                  >
                    {uiMeta.avChar}
                  </div>
                  <span className={styles.cardName}>{uiMeta.userName}</span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className={styles.cardPreview}>{t.preview}</div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardCategory}>{t.category}</span>
                  <span>{formatWait(t.wait_seconds)}</span>
                  <span>{t.round} 轮</span>
                </div>
              </div>
            );
          })}

        {tab === 'serving' &&
          servingTickets.map((t) => {
            const uiMeta = TICKET_UI_META[t.ticket_id] ?? DEFAULT_TICKET_UI_META;
            return (
              <div
                key={t.ticket_id}
                className={`${styles.ticketCard} ${
                  selectedTicketId === t.ticket_id ? styles.ticketCardActive : ''
                }`}
                onClick={() => onTicketClick(t, 'serving')}
              >
                <div className={styles.cardHeader}>
                  <div
                    className={styles.cardAvatar}
                    style={{ background: uiMeta.avColor }}
                  >
                    {uiMeta.avChar}
                  </div>
                  <span className={styles.cardName}>{uiMeta.userName}</span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className={styles.cardPreview}>{t.preview}</div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardCategory}>{t.category}</span>
                  <span>{t.ticket_id}</span>
                </div>
              </div>
            );
          })}

        {tab === 'ended' &&
          endedTickets.map((t) => {
            const uiMeta = TICKET_UI_META[t.ticket_id] ?? DEFAULT_TICKET_UI_META;
            return (
              <div key={t.ticket_id} className={`${styles.ticketCard} ${styles.ticketCardEnded}`}>
                <div className={styles.cardHeader}>
                  <div
                    className={styles.cardAvatar}
                    style={{ background: uiMeta.avColor }}
                  >
                    {uiMeta.avChar}
                  </div>
                  <span className={styles.cardName}>{uiMeta.userName}</span>
                  <span
                    className={`${styles.cardBadge} ${
                      t.endType === 'ai' ? styles.badgeAI : styles.badgeDone
                    }`}
                  >
                    {t.endType === 'ai' ? '转回AI' : '已完成'}
                  </span>
                </div>
                <div className={styles.cardPreview}>{t.preview}</div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardCategory}>{t.category}</span>
                  <span>{t.ticket_id}</span>
                </div>
              </div>
            );
          })}

        {tab === 'pending' && pendingTickets.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 13 }}>
            暂无待接手工单
          </div>
        )}
        {tab === 'serving' && servingTickets.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 13 }}>
            暂无服务中工单
          </div>
        )}
        {tab === 'ended' && endedTickets.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 13 }}>
            暂无已结束工单
          </div>
        )}
      </div>
    </>
  );
}
