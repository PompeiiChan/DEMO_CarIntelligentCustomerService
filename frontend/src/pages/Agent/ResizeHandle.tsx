import { useState, useRef, useCallback } from 'react';
import styles from './Agent.module.css';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
}

export default function ResizeHandle({ onResize }: ResizeHandleProps) {
  const [active, setActive] = useState(false);
  const dragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;
      setActive(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - lastX.current;
        lastX.current = ev.clientX;
        onResize(delta);
      };

      const onMouseUp = () => {
        dragging.current = false;
        setActive(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onResize]
  );

  return (
    <div
      className={`${styles.resizeHandle} ${active ? styles.resizeHandleActive : ''}`}
      onMouseDown={handleMouseDown}
    />
  );
}
