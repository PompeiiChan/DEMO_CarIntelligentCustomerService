import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './Agent.module.css';
import { MOCK_TICKETS } from '../../mocks/tickets';
import type { MockTicket } from '../../mocks/tickets';
import { MOCK_HISTORY } from '../../mocks/messages';
import type { MockMessage } from '../../mocks/messages';
import AgentSidebar from './AgentSidebar';
import ChatCenter from './ChatCenter';
import TicketPanel from './TicketPanel';
import ConfirmModal from './ConfirmModal';
import type { ModalType } from './ConfirmModal';
import ResizeHandle from './ResizeHandle';
import { USE_MOCK } from '../../lib/config';
import { fetchTicket } from '../../services/ticketService';
import type { TicketDetail } from '../../services/ticketService';
import { createAgentWs, assignTicket, postAgentMessage, resolveTicket, transferToAi, markBadCase, fetchSuggestions } from '../../services/agentService';
import type { AgentWsEvent } from '../../services/agentService';

type EndedTicket = MockTicket & { endType?: 'done' | 'ai' };

// Separate initial tickets by status (only used in mock mode)
const INITIAL_PENDING = USE_MOCK ? MOCK_TICKETS.filter((t) => t.status === 'pending') : [];
const INITIAL_SERVING = USE_MOCK ? MOCK_TICKETS.filter((t) => t.status === 'processing') : [];

export default function Agent() {
  const wsRef = useRef<WebSocket | null>(null);

  const [pendingTickets, setPendingTickets] = useState<MockTicket[]>(INITIAL_PENDING);
  const [servingTickets, setServingTickets] = useState<MockTicket[]>(INITIAL_SERVING);
  const [endedTickets, setEndedTickets] = useState<EndedTicket[]>([]);

  // Which ticket is being previewed (clicked from pending list)
  const [previewTicketId, setPreviewTicketId] = useState<string | null>(null);
  // Which ticket is currently active in serving mode
  const [activeTicketId, setActiveTicketId] = useState<string | null>(
    USE_MOCK && INITIAL_SERVING.length > 0 ? INITIAL_SERVING[0].ticket_id : null
  );

  // Mode: 'empty' | 'preview' | 'serving'
  const chatMode = previewTicketId
    ? 'preview'
    : activeTicketId
    ? 'serving'
    : 'empty';

  // Messages per ticket
  const [messagesMap, setMessagesMap] = useState<Record<string, MockMessage[]>>(() => {
    const map: Record<string, MockMessage[]> = {};
    // Pre-load history for all known tickets
    [...INITIAL_PENDING, ...INITIAL_SERVING].forEach((t) => {
      map[t.ticket_id] = MOCK_HISTORY[t.ticket_id] ?? [];
    });
    return map;
  });

  // Bad case tracking per ticket
  const [badCaseMap, setBadCaseMap] = useState<Record<string, boolean>>({});

  // Input value
  const [inputValue, setInputValue] = useState('');

  // Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Modal
  const [modal, setModal] = useState<{ type: ModalType; ticketId: string } | null>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Sidebar widths
  const [slWidth, setSlWidth] = useState(256);
  const [srWidth, setSrWidth] = useState(296);

  // Agent status: 'serving' | 'idle'
  const agentStatus = servingTickets.length > 0 ? 'serving' : 'idle';

  // Timer management
  // setTimerSeconds(0) is NOT called inside the effect to avoid react-hooks/set-state-in-effect;
  // callers (handleAccept, handleTicketClick) reset timerSeconds before switching activeTicketId.
  useEffect(() => {
    if (activeTicketId && chatMode === 'serving') {
      timerRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeTicketId, chatMode]);

  // 真实模式：建立坐席 WS 连接
  useEffect(() => {
    if (USE_MOCK) return;

    const ws = createAgentWs(
      'A001',
      (event: AgentWsEvent) => {
        if (event.type === 'pending_tickets') {
          const tickets = (event.tickets as MockTicket[]).sort(
            (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
          );
          setPendingTickets(tickets.filter((t) => t.status === 'pending'));
          setServingTickets(tickets.filter((t) => t.status === 'processing'));
        } else if (event.type === 'new_ticket') {
          const ticket = event.ticket as MockTicket;
          setPendingTickets((prev) => {
            if (prev.some((t) => t.ticket_id === ticket.ticket_id)) return prev;
            const next = [...prev, ticket].sort(
              (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
            );
            return next;
          });
        } else if (event.type === 'user_message') {
          const { ticket_id, content } = event;
          setMessagesMap((prev) => ({
            ...prev,
            [ticket_id]: [
              ...(prev[ticket_id] ?? []),
              {
                role: 'user' as const,
                content,
                timestamp: new Date().toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ],
          }));
        }
      },
    );

    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const timerDisplay = (() => {
    const m = Math.floor(timerSeconds / 60);
    const s = timerSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  // Ticket click from sidebar
  const handleTicketClick = useCallback(
    async (ticket: MockTicket, tab: 'pending' | 'serving' | 'ended') => {
      if (tab === 'pending') {
        setPreviewTicketId(ticket.ticket_id);
        // 真实模式：从后端拉取工单详情和历史消息
        if (!USE_MOCK && !messagesMap[ticket.ticket_id]) {
          try {
            const detail: TicketDetail = await fetchTicket(ticket.ticket_id);
            if (detail.history?.length) {
              setMessagesMap((prev) => ({
                ...prev,
                [ticket.ticket_id]: detail.history.map((m) => ({
                  role: m.role as MockMessage['role'],
                  content: m.content,
                  timestamp: m.timestamp
                    ? new Date(m.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--:--',
                })),
              }));
            }
          } catch {
            // 加载失败时显示空消息列表，不阻断交互
          }
        }
      } else if (tab === 'serving') {
        setPreviewTicketId(null);
        // Reset timer before activating ticket (avoids setState-in-effect lint error)
        setTimerSeconds(0);
        setActiveTicketId(ticket.ticket_id);
        setInputValue('');
      }
    },
    [messagesMap]
  );

  // Open accept confirm modal (called by ChatCenter when user clicks 接单)
  const openAcceptModal = useCallback(() => {
    if (!previewTicketId) return;
    setModal({ type: 'accept', ticketId: previewTicketId });
  }, [previewTicketId]);

  // Accept ticket (executed after confirm modal confirmation)
  const handleAccept = useCallback(async () => {
    if (!previewTicketId) return;
    const ticket = pendingTickets.find((t) => t.ticket_id === previewTicketId);
    if (!ticket) return;

    if (!USE_MOCK) {
      try {
        await assignTicket(previewTicketId, 'A001');
      } catch (err) {
        console.error('接单失败', err);
      }
    }

    setPendingTickets((prev) => prev.filter((t) => t.ticket_id !== previewTicketId));
    setServingTickets((prev) => [...prev, { ...ticket, status: 'processing' }]);

    // Ensure messages exist
    setMessagesMap((prev) => ({
      ...prev,
      [previewTicketId]: prev[previewTicketId] ?? MOCK_HISTORY[previewTicketId] ?? [],
    }));

    // Reset timer before activating ticket (avoids setState-in-effect lint error)
    setTimerSeconds(0);
    setActiveTicketId(previewTicketId);
    setPreviewTicketId(null);
    setInputValue('');

    setSuggestionsLoading(true);
    setSuggestions([]);
    fetchSuggestions(previewTicketId).then((result) => {
      setSuggestions(result);
      setSuggestionsLoading(false);
    });
  }, [previewTicketId, pendingTickets]);

  // Send message
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !activeTicketId) return;
    const content = inputValue.trim();

    if (!USE_MOCK) {
      try {
        await postAgentMessage(activeTicketId, content, 'A001');
      } catch (err) {
        console.error('发送消息失败', err);
      }
    }

    const newMsg: MockMessage = {
      role: 'agent',
      content,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessagesMap((prev) => ({
      ...prev,
      [activeTicketId]: [...(prev[activeTicketId] ?? []), newMsg],
    }));
    setInputValue('');
  }, [inputValue, activeTicketId]);

  // Open modal
  const openModal = useCallback(
    (type: ModalType) => {
      const ticketId = activeTicketId ?? '';
      if (!ticketId) return;
      setModal({ type, ticketId });
    },
    [activeTicketId]
  );

  // Confirm modal action
  const handleModalConfirm = useCallback(async () => {
    if (!modal) return;
    const { type } = modal;

    if (type === 'accept') {
      setModal(null);
      await handleAccept();
      return;
    }

    const { ticketId } = modal;

    if (type === 'end') {
      if (!USE_MOCK) {
        try {
          await resolveTicket(ticketId);
        } catch (err) {
          console.error('结束工单失败', err);
        }
      }
      const ticket = servingTickets.find((t) => t.ticket_id === ticketId);
      if (ticket) {
        setServingTickets((prev) => prev.filter((t) => t.ticket_id !== ticketId));
        setEndedTickets((prev) => [...prev, { ...ticket, endType: 'done' }]);
      }
      const remainingEnd = servingTickets.filter((t) => t.ticket_id !== ticketId);
      setActiveTicketId(remainingEnd.length > 0 ? remainingEnd[0].ticket_id : null);
    } else if (type === 'transfer') {
      if (!USE_MOCK) {
        try {
          await transferToAi(ticketId);
        } catch (err) {
          console.error('转回AI失败', err);
        }
      }
      const ticket = servingTickets.find((t) => t.ticket_id === ticketId);
      if (ticket) {
        setServingTickets((prev) => prev.filter((t) => t.ticket_id !== ticketId));
        setEndedTickets((prev) => [...prev, { ...ticket, endType: 'ai' }]);
      }
      const remainingTransfer = servingTickets.filter((t) => t.ticket_id !== ticketId);
      setActiveTicketId(remainingTransfer.length > 0 ? remainingTransfer[0].ticket_id : null);
    } else if (type === 'badcase') {
      if (!USE_MOCK) {
        try {
          await markBadCase(ticketId);
        } catch (err) {
          console.error('Bad Case 标注失败', err);
        }
      }
      setBadCaseMap((prev) => ({ ...prev, [ticketId]: true }));
      // Append system pill
      const sysMsg: MockMessage = {
        role: 'system',
        content: '🚩 本对话已标注为 Bad Case，将进入质检复核队列',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessagesMap((prev) => ({
        ...prev,
        [ticketId]: [...(prev[ticketId] ?? []), sysMsg],
      }));
    }

    setModal(null);
  }, [modal, servingTickets, handleAccept]);

  const activeTicket =
    servingTickets.find((t) => t.ticket_id === activeTicketId) ?? null;
  const previewTicket =
    pendingTickets.find((t) => t.ticket_id === previewTicketId) ?? null;
  const currentMessages =
    chatMode === 'preview' && previewTicketId
      ? (messagesMap[previewTicketId] ?? MOCK_HISTORY[previewTicketId] ?? [])
      : activeTicketId
      ? (messagesMap[activeTicketId] ?? [])
      : [];

  const isBadCaseMarked = activeTicketId ? !!badCaseMap[activeTicketId] : false;

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLogo}>极</div>
        <span className={styles.toolbarTitle}>坐席工作台</span>
        <div className={styles.toolbarSep} />
        <div className={styles.agentStatus}>
          <div
            className={`${styles.statusDot} ${
              agentStatus === 'serving' ? styles.statusDotGreen : styles.statusDotYellow
            }`}
          />
          张三 · {agentStatus === 'serving' ? '服务中' : '空闲'}
        </div>
        {activeTicketId ? (
          <button
            className={styles.btnEndTicket}
            onClick={() => openModal('end')}
          >
            结束工单
          </button>
        ) : (
          <button className={styles.btnEndTicketDisabled} disabled>
            结束工单
          </button>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Left sidebar */}
        <div className={styles.sl} style={{ width: slWidth, minWidth: 180, maxWidth: 400 }}>
          <AgentSidebar
            pendingTickets={pendingTickets}
            servingTickets={servingTickets}
            endedTickets={endedTickets}
            selectedTicketId={activeTicketId}
            previewTicketId={previewTicketId}
            onTicketClick={handleTicketClick}
          />
        </div>

        <ResizeHandle
          onResize={(delta) =>
            setSlWidth((w) => Math.min(400, Math.max(180, w + delta)))
          }
        />

        {/* Center */}
        <ChatCenter
          mode={chatMode}
          previewTicket={previewTicket}
          activeTicket={activeTicket}
          messages={currentMessages}
          inputValue={inputValue}
          isBadCaseMarked={isBadCaseMarked}
          timerDisplay={timerDisplay}
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
          onAcceptRequest={openAcceptModal}
          onInputChange={setInputValue}
          onSend={handleSend}
          onBadCase={() => openModal('badcase')}
        />

        <ResizeHandle
          onResize={(delta) =>
            setSrWidth((w) => Math.min(440, Math.max(200, w - delta)))
          }
        />

        {/* Right panel */}
        <div className={styles.sr} style={{ width: srWidth, minWidth: 200, maxWidth: 440 }}>
          <TicketPanel
            ticket={activeTicket}
            isBadCaseMarked={isBadCaseMarked}
            onTransfer={() => openModal('transfer')}
            onBadCase={() => openModal('badcase')}
            onEnd={() => openModal('end')}
          />
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <ConfirmModal
          type={modal.type}
          ticketId={modal.ticketId}
          onCancel={() => setModal(null)}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  );
}
