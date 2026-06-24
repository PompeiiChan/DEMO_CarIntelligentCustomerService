import { useState, useRef, useEffect, useCallback } from 'react';
import type { UIChatMessage } from '../../mocks/chat';
import { AI_REPLY_RULES, FALLBACK_REPLIES } from '../../mocks/chat';
import { USE_MOCK } from '../../lib/config';
import PhoneShell from './PhoneShell';
import StatusBar from './StatusBar';
import ChatHeader from './ChatHeader';
import ChatBody from './ChatBody';
import QuickActions from './QuickActions';
import ChatInput from './ChatInput';
import styles from './Chat.module.css';

function nowTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const INITIAL_MESSAGES: UIChatMessage[] = [
  {
    _uiId: makeId(),
    role: 'assistant',
    content: '您好！我是极氪智能客服，请问有什么可以帮助您？',
    timestamp: nowTime(),
  },
  {
    _uiId: makeId(),
    role: 'assistant',
    content: '您可以点击下方快捷按钮，或者直接输入您的问题。',
    timestamp: nowTime(),
  },
];

export default function Chat() {
  const [messages, setMessages] = useState<UIChatMessage[]>(INITIAL_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [isHuman, setIsHuman] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [msgCount, setMsgCount] = useState(0);
  const [ticketNo, setTicketNo] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fallbackIdxRef = useRef(0);
  const isTypingRef = useRef(false);
  const isHumanRef = useRef(false);

  // WebSocket refs (only used when USE_MOCK=false)
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const wsRef = useRef<WebSocket | null>(null);
  // Ref to track the id of the current streaming AI message bubble
  const streamingMsgIdRef = useRef<string | null>(null);

  // Sync isTypingRef with state so callbacks have fresh value
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  // Auto-scroll to bottom on new messages or typing indicator change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const appendMessage = useCallback((msg: UIChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // ---------------------------------------------------------------------------
  // WebSocket setup (only when not mock mode)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (USE_MOCK) return;

    const sid = sessionIdRef.current;
    let active = true; // StrictMode 双调用保护：cleanup 后不触发错误提示

    const ws = new WebSocket(`ws://${location.host}/ws/chat/${sid}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'delta') {
          const chunk: string = msg.content ?? '';
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (streamingMsgIdRef.current && last && last._uiId === streamingMsgIdRef.current) {
              return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
            }
            const newId = makeId();
            streamingMsgIdRef.current = newId;
            setIsTyping(false);
            return [...prev, { _uiId: newId, role: 'assistant', content: chunk, timestamp: nowTime() }];
          });
        } else if (msg.type === 'done') {
          streamingMsgIdRef.current = null;
          setIsTyping(false);
        } else if (msg.type === 'transfer') {
          streamingMsgIdRef.current = null;
          setIsTyping(false);
          const data = msg.data ?? {};
          const tid: string = data.ticket_id ?? ('T' + Date.now().toString().slice(-8));
          const pos: number = data.queue_position ?? 1;
          setTicketNo(tid);

          setTimeout(() => {
            appendMessage({ _uiId: makeId(), role: 'system', content: `工单 ${tid} 已创建 · 高优先级 · 预计等待约 ${pos} 分钟`, timestamp: nowTime() });
            setTimeout(() => {
              appendMessage({ _uiId: makeId(), role: 'system', content: `人工客服已接入 · ${nowTime()}`, timestamp: nowTime() });
              setIsHuman(true);
              setTimeout(() => {
                setIsTyping(true);
                setTimeout(() => {
                  setIsTyping(false);
                  appendMessage({ _uiId: makeId(), role: 'agent', content: '人工客服已接入，查阅历史记录后将会尽快回复您。', timestamp: nowTime() });
                }, 1600);
              }, 600);
            }, 1200);
          }, 1200);
        } else if (msg.type === 'agent_message') {
          appendMessage({ _uiId: makeId(), role: 'agent', content: msg.content ?? '', timestamp: nowTime() });
        } else if (msg.type === 'ticket_closed') {
          appendMessage({ _uiId: makeId(), role: 'system', content: msg.content ?? '本次服务已结束，感谢您的耐心等待。', timestamp: nowTime() });
          setIsHuman(false);
          isHumanRef.current = false;
        } else if (msg.type === 'error') {
          streamingMsgIdRef.current = null;
          setIsTyping(false);
          appendMessage({ _uiId: makeId(), role: 'system', content: `服务异常：${msg.message ?? '未知错误'}`, timestamp: nowTime() });
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => {
      // 只在 effect 仍然有效时显示错误（StrictMode cleanup 触发的 error 不显示）
      if (active) {
        setIsTyping(false);
        appendMessage({ _uiId: makeId(), role: 'system', content: '连接异常，请刷新页面重试。', timestamp: nowTime() });
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    return () => {
      active = false;
      ws.close();
      wsRef.current = null;
    };
  }, [appendMessage]);

  // ---------------------------------------------------------------------------
  // Mock: human transfer flow (unchanged)
  // ---------------------------------------------------------------------------
  const switchToHuman = useCallback(
    (currentTicketNo: string) => {
      const t = nowTime();

      setTimeout(() => {
        appendMessage({
          _uiId: makeId(),
          role: 'system',
          content: `工单 ${currentTicketNo} 已创建 · 高优先级 · 预计等待 1 分钟`,
          timestamp: t,
        });

        setTimeout(() => {
          appendMessage({
            _uiId: makeId(),
            role: 'system',
            content: `人工客服已接入 · ${nowTime()}`,
            timestamp: nowTime(),
          });
          isHumanRef.current = true;
          setIsHuman(true);

          setTimeout(() => {
            setIsTyping(true);
            setTimeout(() => {
              setIsTyping(false);
              appendMessage({
                _uiId: makeId(),
                role: 'agent',
                content: '人工客服已接入，查阅历史记录后将会尽快回复您。',
                timestamp: nowTime(),
              });
            }, 1600);
          }, 600);
        }, 1200);
      }, 1200);
    },
    [appendMessage],
  );

  // ---------------------------------------------------------------------------
  // Message submission
  // ---------------------------------------------------------------------------
  const submitMessage = useCallback((rawText: string) => {
    const text = rawText.trim();
    if (!text || isTypingRef.current) return;

    setInputValue('');
    const newCount = msgCount + 1;
    setMsgCount(newCount);

    appendMessage({
      _uiId: makeId(),
      role: 'user',
      content: text,
      timestamp: nowTime(),
    });

    if (USE_MOCK) {
      // ---- Original mock logic ----
      setIsTyping(true);
      const delay = 900 + Math.random() * 600;

      if (isHuman) {
        const agentReplies = [
          '好的，我这边看一下您的情况。',
          '明白了，请稍等，我帮您核实一下。',
          `根据您描述的情况，建议您${
            ['预约到店检查', '联系当地服务中心', '通过极氪 App 提交工单'][newCount % 3]
          }。`,
          '好的，我已为您记录，稍后会有专人跟进，感谢您的耐心等待。',
        ];
        setTimeout(() => {
          setIsTyping(false);
          appendMessage({
            _uiId: makeId(),
            role: 'agent',
            content: agentReplies[newCount % agentReplies.length],
            timestamp: nowTime(),
          });
        }, delay);
        return;
      }

      setTimeout(() => {
        setIsTyping(false);

        const lowerText = text.toLowerCase();
        let matchedRule: (typeof AI_REPLY_RULES)[number] | null = null;
        for (const rule of AI_REPLY_RULES) {
          if (rule.keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
            matchedRule = rule;
            break;
          }
        }

        const reply = matchedRule
          ? matchedRule.reply
          : FALLBACK_REPLIES[fallbackIdxRef.current++ % FALLBACK_REPLIES.length];

        appendMessage({
          _uiId: makeId(),
          role: 'assistant',
          content: reply,
          timestamp: nowTime(),
        });

        if (matchedRule?.transfer && !isHumanRef.current) {
          isHumanRef.current = true;
          const ticket = 'T' + Date.now().toString().slice(-8);
          setTicketNo(ticket);
          setTimeout(() => switchToHuman(ticket), 800);
          return;
        }

        // F1: 第 4 条消息后自动触发完整转人工流程
        if (newCount >= 4 && !isHumanRef.current) {
          isHumanRef.current = true;
          const ticket = 'T' + Date.now().toString().slice(-8);
          setTicketNo(ticket);
          setTimeout(() => switchToHuman(ticket), 1000);
        }
      }, delay);
    } else {
      // ---- WebSocket mode ----
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        appendMessage({
          _uiId: makeId(),
          role: 'system',
          content: '连接未就绪，请稍后重试。',
          timestamp: nowTime(),
        });
        return;
      }

      // 人工服务中消息直接转发后端，后端推给坐席，不启动 AI 流式输出
      if (!isHuman) {
        streamingMsgIdRef.current = null;
        setIsTyping(true);
      }
      wsRef.current.send(JSON.stringify({ message: text }));
    }
  }, [msgCount, isHuman, appendMessage, switchToHuman]);

  const handleSend = useCallback(() => {
    submitMessage(inputValue);
  }, [inputValue, submitMessage]);

  function handleQuickSelect(label: string) {
    submitMessage(label);
  }

  const placeholder = isHuman ? '回复人工客服…' : '输入您的问题…';

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageMeta}>
        <h1>C01 · 客户端对话页</h1>
        <p>移动端 H5 · 390 × 852 · 展示 AI对话 → 工单创建 → 人工接入 完整链路</p>
      </div>

      <PhoneShell>
        <StatusBar />
        <ChatHeader isHuman={isHuman} ticketNo={ticketNo} />
        <ChatBody
          messages={messages}
          isTyping={isTyping}
          isHuman={isHuman}
          messagesEndRef={messagesEndRef}
        />
        <QuickActions onSelect={handleQuickSelect} />
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          placeholder={placeholder}
          inputRef={inputRef}
        />
      </PhoneShell>
    </div>
  );
}
