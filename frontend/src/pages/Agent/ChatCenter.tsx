import { useEffect, useRef, useCallback } from 'react';
import styles from './Agent.module.css';
import type { MockTicket } from '../../mocks/tickets';
import { TICKET_UI_META, DEFAULT_TICKET_UI_META } from '../../mocks/tickets';
import type { MockMessage } from '../../mocks/messages';

interface ChatCenterProps {
  mode: 'empty' | 'preview' | 'serving';
  previewTicket: MockTicket | null;
  activeTicket: MockTicket | null;
  messages: MockMessage[];
  inputValue: string;
  isBadCaseMarked: boolean;
  timerDisplay: string;
  suggestions: string[];
  suggestionsLoading: boolean;
  /** 点击「接单」时触发，父组件负责弹确认框，确认后再调用 onAccept */
  onAcceptRequest: () => void;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onBadCase: () => void;
}

function MessageBubble({ msg, userAvChar, userName }: { msg: MockMessage; userAvChar?: string; userName?: string }) {
  if (msg.role === 'system') {
    return (
      <div className={styles.msgRowCenter}>
        <div className={styles.msgBubbleSystem}>{msg.content}</div>
      </div>
    );
  }

  const isRight = msg.role === 'agent';
  const isAI = msg.role === 'assistant';

  return (
    <div className={`${styles.msgRow} ${isRight ? styles.msgRowRight : ''}`}>
      {!isRight && (
        <div className={`${styles.msgAvatar} ${isAI ? styles.msgAvatarAI : styles.msgAvatarUser}`}>
          {isAI ? 'AI' : (userAvChar ?? '用')}
        </div>
      )}
      <div className={`${styles.msgContent} ${isRight ? styles.msgContentRight : ''}`}>
        <div className={styles.msgSenderLabel} style={isRight ? { textAlign: 'right' } : {}}>
          {isRight ? '张三（坐席）' : isAI ? 'AI 客服' : (userName ?? '用户')}
        </div>
        <div
          className={`${styles.msgBubble} ${
            isRight
              ? styles.msgBubbleRight
              : isAI
              ? styles.msgBubbleAI
              : styles.msgBubbleLeft
          }`}
        >
          {msg.content}
        </div>
        <div className={styles.msgTime} style={isRight ? { textAlign: 'right' } : {}}>
          {msg.timestamp}
        </div>
      </div>
      {isRight && (
        <div className={`${styles.msgAvatar} ${styles.msgAvatarAgent}`}>
          张
        </div>
      )}
    </div>
  );
}

export default function ChatCenter({
  mode,
  previewTicket,
  activeTicket,
  messages,
  inputValue,
  isBadCaseMarked,
  timerDisplay,
  suggestions,
  suggestionsLoading,
  onAcceptRequest,
  onInputChange,
  onSend,
  onBadCase,
}: ChatCenterProps) {
  const msgEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputValue.trim()) onSend();
      }
    },
    [inputValue, onSend]
  );

  if (mode === 'empty') {
    return (
      <div className={styles.cm}>
        <div className={styles.cmEmpty}>
          <div className={styles.cmEmptyIcon}>💬</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>请从左侧选择工单</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>点击待接手或服务中的工单卡片开始工作</div>
        </div>
      </div>
    );
  }

  if (mode === 'preview' && previewTicket) {
    const previewUIMeta = TICKET_UI_META[previewTicket.ticket_id] ?? DEFAULT_TICKET_UI_META;
    const previewMsgs = messages;
    return (
      <div className={styles.cm}>
        <div className={styles.previewPanel}>
          <div className={styles.previewHeader}>
            <div
              className={styles.cardAvatar}
              style={{ background: previewUIMeta.avColor, width: 36, height: 36, fontSize: 14 }}
            >
              {previewUIMeta.avChar}
            </div>
            <div className={styles.previewHeaderInfo}>
              <div className={styles.previewHeaderName}>{previewUIMeta.userName}</div>
              <div className={styles.previewHeaderMeta}>
                {previewTicket.ticket_id} · {previewTicket.category} · 转接原因：{previewTicket.transfer_reason}
              </div>
            </div>
          </div>

          <div className={styles.previewMessages}>
            <div className={styles.previewLabel}>以下为 AI 客服对话历史</div>
            {previewMsgs.map((msg, idx) => (
              <MessageBubble key={idx} msg={msg} userAvChar={previewUIMeta.avChar} userName={previewUIMeta.userName} />
            ))}
          </div>

          <div className={styles.previewFooter}>
            <button className={styles.btnAccept} onClick={onAcceptRequest}>
              接单 — 开始为 {previewUIMeta.userName} 服务
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'serving' && activeTicket) {
    const activeUIMeta = TICKET_UI_META[activeTicket.ticket_id] ?? DEFAULT_TICKET_UI_META;
    return (
      <div className={styles.cm}>
        <div className={styles.convBar}>
          <div
            className={styles.msgAvatar}
            style={{ background: activeUIMeta.avColor, width: 34, height: 34 }}
          >
            {activeUIMeta.avChar}
          </div>
          <div className={styles.convBarInfo}>
            <div className={styles.convBarName}>{activeUIMeta.userName}</div>
            <div className={styles.convBarTicket}>{activeTicket.ticket_id} · {activeTicket.category}</div>
          </div>
          <div className={styles.convTimer}>服务中 {timerDisplay}</div>
        </div>

        <div className={styles.msgList}>
          {messages.map((msg, idx) => (
            <MessageBubble key={idx} msg={msg} userAvChar={activeUIMeta.avChar} userName={activeUIMeta.userName} />
          ))}
          <div ref={msgEndRef} />
        </div>

        <div className={styles.aiSuggest}>
          <div className={styles.aiSuggestTitle}>
            <span>✨</span> AI 建议回复
          </div>
          <div className={styles.aiSuggestList}>
            {suggestionsLoading ? (
              <>
                <div style={{ height: 36, background: '#f3f4f6', borderRadius: 6, marginBottom: 6 }} />
                <div style={{ height: 36, background: '#f3f4f6', borderRadius: 6 }} />
              </>
            ) : suggestions.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0' }}>暂无建议</div>
            ) : (
              suggestions.map((s, i) => (
                <div key={i} className={styles.aiSuggestItem}>
                  <span className={styles.aiSuggestText}>{s}</span>
                  <button
                    className={styles.btnAdopt}
                    onClick={() => onInputChange(s)}
                  >
                    采用
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.inputArea}>
          <div className={styles.inputRow}>
            <textarea
              ref={textareaRef}
              className={styles.inputTextarea}
              placeholder="输入回复内容…"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
            <div className={styles.inputActions}>
              <button
                className={isBadCaseMarked ? styles.btnBadCaseMarked : styles.btnBadCase}
                onClick={isBadCaseMarked ? undefined : onBadCase}
              >
                {isBadCaseMarked ? '✓ 已标注' : '🚩 Bad Case'}
              </button>
              <button
                className={styles.btnSend}
                disabled={!inputValue.trim()}
                onClick={onSend}
              >
                发送
              </button>
            </div>
          </div>
          <div className={styles.inputHint}>Enter 发送 · Shift+Enter 换行</div>
        </div>
      </div>
    );
  }

  return null;
}
