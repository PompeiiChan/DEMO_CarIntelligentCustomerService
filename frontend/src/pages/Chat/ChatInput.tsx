import type { KeyboardEvent, RefObject } from 'react';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  placeholder = '输入您的问题…',
  inputRef,
}: ChatInputProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <>
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <button className={styles.attachBtn} aria-label="更多功能">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#8E8E93" strokeWidth="1.6" />
              <path
                d="M12 7.5V16.5M7.5 12H16.5"
                stroke="#8E8E93"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className={styles.inputWrap}>
            <textarea
              ref={inputRef}
              className={styles.chatInput}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              autoComplete="off"
            />
          </div>

          <button className={styles.sendBtn} onClick={onSend} aria-label="发送">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 15V4M9 4L4.5 8.5M9 4L13.5 8.5"
                stroke="white"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.homeBar}>
        <div className={styles.homeLine} />
      </div>
    </>
  );
}
