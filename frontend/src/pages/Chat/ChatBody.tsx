import type { RefObject } from 'react';
import type { UIChatMessage as ChatMessage } from '../../mocks/chat';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import styles from './ChatBody.module.css';

interface ChatBodyProps {
  messages: ChatMessage[];
  isTyping: boolean;
  isHuman: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

function getDaySepLabel(): string {
  const d = new Date();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `今天 ${h}:${m}`;
}

export default function ChatBody({
  messages,
  isTyping,
  isHuman,
  messagesEndRef,
}: ChatBodyProps) {
  return (
    <div className={styles.chatBody}>
      <div className={styles.daySep}>{getDaySepLabel()}</div>

      {messages.map((msg) => (
        <MessageBubble key={msg._uiId} message={msg} />
      ))}

      {isTyping && <TypingIndicator isAgent={isHuman} />}

      <div className={styles.spacer} />
      <div ref={messagesEndRef} />
    </div>
  );
}
