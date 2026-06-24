import type { ReactNode } from 'react';
import styles from './PhoneShell.module.css';

interface PhoneShellProps {
  children: ReactNode;
}

export default function PhoneShell({ children }: PhoneShellProps) {
  return (
    <div className={styles.phone}>
      <div className={styles.dynamicIsland} />
      <div className={styles.screen}>{children}</div>
    </div>
  );
}
