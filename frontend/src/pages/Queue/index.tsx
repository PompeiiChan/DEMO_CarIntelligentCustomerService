import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_TICKETS, TICKET_UI_META, DEFAULT_TICKET_UI_META } from '../../mocks/tickets';
import type { MockTicket } from '../../mocks/tickets';
import { USE_MOCK } from '../../lib/config';
import { fetchTickets } from '../../services/ticketService';
import type { Ticket } from '../../services/ticketService';
import styles from './Queue.module.css';

type FilterType = '全部' | '售前' | '售后' | '负面情绪';
type SortType = 'wait' | 'prio' | 'ticket';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function formatWait(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${String(s).padStart(2, '0')}秒`;
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 3.5 H13.5 L2.5 12.5 H13.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface TicketCardProps {
  ticket: Ticket;
  onAccept: (ticketId: string) => void;
}

function TicketCard({ ticket, onAccept }: TicketCardProps) {
  const isProcessing = ticket.status === 'processing';
  const isUrgent = ticket.priority === 'high';
  const uiMeta = TICKET_UI_META[ticket.ticket_id] ?? DEFAULT_TICKET_UI_META;

  const stripeClass = isProcessing
    ? styles.tcStripeServing
    : ticket.priority === 'high'
      ? styles.tcStripeHigh
      : ticket.priority === 'medium'
        ? styles.tcStripeMedium
        : styles.tcStripeLow;

  const prioBadgeClass = ticket.priority === 'high'
    ? styles.prioBadgeHigh
    : ticket.priority === 'medium'
      ? styles.prioBadgeMedium
      : styles.prioBadgeLow;

  const prioLabel = ticket.priority === 'high' ? '紧急' : '普通';

  const waitIsUrgent = !isProcessing && ticket.wait_seconds > 0 && ticket.priority === 'high';

  return (
    <div className={`${styles.tc} ${isProcessing ? styles.tcInProgress : ''}`}>
      <div className={`${styles.tcStripe} ${stripeClass}`} />
      <div className={styles.tcBody}>
        <div
          className={styles.tcAv}
          style={{ background: uiMeta.avColor }}
        >
          {uiMeta.avChar}
        </div>
        <div className={styles.tcContent}>
          <div className={styles.tcTop}>
            <span className={styles.tcName}>{uiMeta.userName}</span>
            <span className={styles.tcTicket}>{ticket.ticket_id}</span>
            <span className={`${styles.tagSm} ${ticket.category === '售后' ? styles.tagAfter : styles.tagBefore}`}>
              {ticket.category}
            </span>
            {ticket.emotion === 'negative' ? (
              <span className={`${styles.tagSm} ${styles.tagNeg}`}>负面情绪</span>
            ) : (
              <span className={`${styles.tagSm} ${styles.tagOk}`}>情绪正常</span>
            )}
          </div>
          <div className={styles.tcPreview}>{ticket.preview}</div>
          <div className={styles.tcMeta}>
            {isProcessing ? (
              <>
                <div className={styles.tcMetaItem}>
                  已服务
                  <span className={styles.tcMetaVal}>--</span>
                </div>
                <div className={styles.tcMetaItem}>
                  坐席
                  <span className={styles.tcMetaVal}>{uiMeta.agentName ?? '张三'}</span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.tcMetaItem}>
                  等待
                  <span className={waitIsUrgent ? styles.tcMetaValUrgent : styles.tcMetaVal}>
                    {formatWait(ticket.wait_seconds)}
                  </span>
                </div>
                <div className={styles.tcMetaItem}>
                  对话
                  <span className={styles.tcMetaVal}>{ticket.round} 轮</span>
                </div>
                <div className={styles.tcMetaItem}>
                  <span className={styles.reasonChip}>{ticket.transfer_reason}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className={styles.tcRight}>
        {isProcessing ? (
          <span className={styles.inProgressBadge}>服务中</span>
        ) : (
          <span className={`${styles.prioBadge} ${prioBadgeClass}`}>{prioLabel}</span>
        )}
        {isProcessing ? (
          <button className={`${styles.acceptBtn} ${styles.acceptBtnDisabled}`}>
            接手
          </button>
        ) : isUrgent ? (
          <button
            className={`${styles.acceptBtn} ${styles.acceptBtnUrgent}`}
            onClick={() => onAccept(ticket.ticket_id)}
          >
            立即接手 <ArrowIcon />
          </button>
        ) : (
          <button
            className={`${styles.acceptBtn} ${styles.acceptBtnNormal}`}
            onClick={() => onAccept(ticket.ticket_id)}
          >
            接手 <ArrowIcon />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Queue() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('全部');
  const [sort, setSort] = useState<SortType>('wait');
  const [tickets, setTickets] = useState<Ticket[]>(USE_MOCK ? (MOCK_TICKETS as MockTicket[]) : []);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (USE_MOCK) return;

    let cancelled = false;

    async function loadTickets() {
      setLoading(true);
      setError(null);

      const params: Parameters<typeof fetchTickets>[0] = {};

      // 映射 filter
      if (filter === '售前') params.category = '售前';
      else if (filter === '售后') params.category = '售后';
      else if (filter === '负面情绪') params.emotion = 'negative';

      // 映射 sort
      if (sort === 'wait') params.sort = 'wait_time_desc';
      else if (sort === 'prio') params.sort = 'priority_desc';
      else if (sort === 'ticket') params.sort = 'created_asc';

      params.page = 1;
      params.page_size = 100;

      try {
        const res = await fetchTickets(params);
        if (!cancelled) {
          setTickets(res.items);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败');
          setLoading(false);
        }
      }
    }

    void loadTickets();

    return () => {
      cancelled = true;
    };
  }, [filter, sort]);

  function handleAccept(ticketId: string) {
    navigate(`/agent?ticketId=${ticketId}`);
  }

  const filtered = useMemo(() => {
    if (!USE_MOCK) {
      // 后端已按 filter 过滤，直接使用
      return tickets;
    }
    return (MOCK_TICKETS as MockTicket[]).filter((t) => {
      if (filter === '全部') return true;
      if (filter === '售前') return t.category === '售前';
      if (filter === '售后') return t.category === '售后';
      if (filter === '负面情绪') return t.emotion === 'negative';
      return true;
    });
  }, [filter, tickets]);

  const pendingTickets = useMemo(() => {
    const pending = filtered.filter((t) => t.status === 'pending');
    if (!USE_MOCK) {
      // 后端已按 sort 排序（wait_time_desc / priority_desc / created_asc），直接用
      return pending;
    }
    return [...pending].sort((a, b) => {
      if (sort === 'wait') return b.wait_seconds - a.wait_seconds;
      if (sort === 'prio') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (sort === 'ticket') return a.created_at.localeCompare(b.created_at);
      return 0;
    });
  }, [filtered, sort]);

  const processingTickets = useMemo(() => {
    return filtered.filter((t) => t.status === 'processing');
  }, [filtered]);

  // Stats — always compute from current tickets state
  const allPending = tickets.filter((t) => t.status === 'pending');
  const allProcessing = tickets.filter((t) => t.status === 'processing');
  const urgentCount = allPending.filter((t) => t.priority === 'high').length;
  const avgWait = allPending.length > 0
    ? Math.round(allPending.reduce((s, t) => s + t.wait_seconds, 0) / allPending.length)
    : 0;
  const avgWaitMin = Math.floor(avgWait / 60);
  const avgWaitSec = avgWait % 60;

  // Filter counts — from current tickets state
  const countAll = tickets.length;
  const countBefore = tickets.filter((t) => t.category === '售前').length;
  const countAfter = tickets.filter((t) => t.category === '售后').length;
  const countNeg = tickets.filter((t) => t.emotion === 'negative').length;

  return (
    <div className={styles.appShell}>
      {/* Toolbar */}
      <header className={styles.toolbar}>
        <div className={styles.tbBrand}>
          <div className={styles.tbLogo}>
            <LogoIcon />
          </div>
          <span className={styles.tbTitle}>智能汽车客服</span>
        </div>
        <div className={styles.tbDivider} />
        <nav className={styles.tbBreadcrumb}>
          <a href="/agent" className={styles.tbBcLink}>坐席工作台</a>
          <span className={styles.tbBcSep}>›</span>
          <span className={styles.tbBcCurrent}>对话列表</span>
        </nav>
        <div className={styles.tbSpacer} />
        <div className={styles.agentStatus}>
          <div className={styles.agentDot} />
          <span className={styles.agentName}>张三</span>
          <span className={styles.agentLabel}>· 空闲</span>
        </div>
      </header>

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <div className={`${styles.statNum} ${styles.statNumRed}`}>{allPending.length}</div>
          <div className={styles.statLabel}>待接手</div>
        </div>
        <div className={styles.statItem}>
          <div className={`${styles.statNum} ${styles.statNumGreen}`}>{allProcessing.length}</div>
          <div className={styles.statLabel}>服务中</div>
        </div>
        <div className={styles.statItem}>
          <div className={`${styles.statNum} ${styles.statNumOrange}`}>
            {avgWaitMin}:{String(avgWaitSec).padStart(2, '0')}
          </div>
          <div className={styles.statLabel}>平均等待</div>
        </div>
        <div className={styles.statItem}>
          <div className={`${styles.statNum} ${styles.statNumRed}`}>{urgentCount}</div>
          <div className={styles.statLabel}>紧急工单</div>
        </div>
        <div className={styles.statSpacer} />
        <div className={styles.refreshIndicator}>
          <div className={styles.refreshDot} />
          自动刷新 · 每 30 秒
        </div>
      </div>

      {/* Main */}
      <div className={styles.main}>
        {/* Filter row */}
        <div className={styles.filterRow}>
          <button
            className={`${styles.fc} ${filter === '全部' ? styles.fcActive : ''}`}
            onClick={() => setFilter('全部')}
          >
            全部&ensp;{countAll}
          </button>
          <button
            className={`${styles.fc} ${filter === '售前' ? styles.fcActive : ''}`}
            onClick={() => setFilter('售前')}
          >
            售前&ensp;{countBefore}
          </button>
          <button
            className={`${styles.fc} ${filter === '售后' ? styles.fcActive : ''}`}
            onClick={() => setFilter('售后')}
          >
            售后&ensp;{countAfter}
          </button>
          <button
            className={`${styles.fc} ${
              filter === '负面情绪' ? styles.fcNegativeActive : styles.fcNegative
            }`}
            onClick={() => setFilter('负面情绪')}
          >
            负面情绪&ensp;{countNeg}
          </button>
          <div className={styles.filterSpacer} />
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortType)}
          >
            <option value="wait">按等待时长排序</option>
            <option value="prio">按优先级排序</option>
            <option value="ticket">按工单创建时间</option>
          </select>
        </div>

        {/* Loading / Error state */}
        {!USE_MOCK && loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary, #6B7280)' }}>
            加载中...
          </div>
        )}
        {!USE_MOCK && error && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-red, #FF3B30)' }}>
            {error}
          </div>
        )}

        {/* Pending section */}
        <div className={styles.sectionDivider}>待接手 · {pendingTickets.length} 条</div>
        <div className={styles.ticketList}>
          {pendingTickets.map((ticket) => (
            <TicketCard key={ticket.ticket_id} ticket={ticket} onAccept={handleAccept} />
          ))}
        </div>

        {/* Processing section */}
        <div className={styles.sectionDivider} style={{ marginTop: 24 }}>
          服务中 · {processingTickets.length} 条
        </div>
        <div className={styles.ticketList}>
          {processingTickets.map((ticket) => (
            <TicketCard key={ticket.ticket_id} ticket={ticket} onAccept={handleAccept} />
          ))}
        </div>
      </div>
    </div>
  );
}
