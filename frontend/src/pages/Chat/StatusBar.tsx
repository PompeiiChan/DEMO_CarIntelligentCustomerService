import styles from './StatusBar.module.css';

function getTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function StatusBar() {
  return (
    <div className={styles.statusBar}>
      <span className={styles.statusTime}>{getTime()}</span>
      <div className={styles.statusIcons}>
        {/* Signal bars */}
        <svg width="18" height="13" viewBox="0 0 18 13" fill="none">
          <rect x="0" y="8" width="3.5" height="5" rx="1" fill="#1C1C1E" />
          <rect x="4.5" y="5.5" width="3.5" height="7.5" rx="1" fill="#1C1C1E" />
          <rect x="9" y="3" width="3.5" height="10" rx="1" fill="#1C1C1E" />
          <rect x="13.5" y="0" width="3.5" height="13" rx="1" fill="#1C1C1E" />
        </svg>
        {/* WiFi */}
        <svg width="17" height="13" viewBox="0 0 17 13" fill="none">
          <circle cx="8.5" cy="11.5" r="1.5" fill="#1C1C1E" />
          <path
            d="M5.2 8.8A4.7 4.7 0 0 1 8.5 7.5a4.7 4.7 0 0 1 3.3 1.3"
            stroke="#1C1C1E"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M2.2 5.8A8.2 8.2 0 0 1 8.5 3.5a8.2 8.2 0 0 1 6.3 2.3"
            stroke="#1C1C1E"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
          />
        </svg>
        {/* Battery */}
        <svg width="26" height="13" viewBox="0 0 26 13" fill="none">
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="12"
            rx="3.5"
            stroke="#1C1C1E"
            strokeOpacity="0.35"
          />
          <rect x="2" y="2" width="17" height="9" rx="2.5" fill="#1C1C1E" />
          <path
            d="M24 4.5V8.5C24.8 8.2 25.5 7.4 25.5 6.5S24.8 4.8 24 4.5Z"
            fill="#1C1C1E"
            opacity="0.4"
          />
        </svg>
      </div>
    </div>
  );
}
