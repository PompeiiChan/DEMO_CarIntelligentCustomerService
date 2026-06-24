import { QUICK_ACTIONS } from '../../mocks/chat';
import styles from './QuickActions.module.css';

interface QuickActionsProps {
  onSelect: (label: string) => void;
}

export default function QuickActions({ onSelect }: QuickActionsProps) {
  return (
    <div className={styles.quickArea}>
      <div className={styles.quickLabel}>常见问题</div>
      <div className={styles.quickRow}>
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            className={styles.qc}
            onClick={() => onSelect(action.label)}
          >
            <span className={styles.qi}>{action.emoji}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
