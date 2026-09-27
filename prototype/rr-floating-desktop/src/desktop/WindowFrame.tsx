import { useState, useRef, useEffect } from 'react';
import { WindowType } from '../App';
import styles from './WindowFrame.module.css';

interface WindowFrameProps {
  id: WindowType;
  title: string;
  width: number;
  height: number;
  initialX?: number;
  initialY?: number;
  zIndex: number;
  isFocused: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  children: React.ReactNode;
}

export default function WindowFrame({
  title,
  width,
  height,
  initialX = 100,
  initialY = 100,
  zIndex,
  isFocused,
  onClose,
  onMinimize,
  onFocus,
  children
}: WindowFrameProps) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const centerX = (window.innerWidth - width) / 2;
    const centerY = (window.innerHeight - height) / 2;
    setPosition({ 
      x: centerX + (Math.random() - 0.5) * 100, 
      y: Math.max(50, centerY + (Math.random() - 0.5) * 80)
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    setIsDragging(true);
    onFocus();
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragStart.current.x;
      const newY = e.clientY - dragStart.current.y;
      
      const maxX = window.innerWidth - width;
      const maxY = window.innerHeight - height;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(32, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, width, height]);

  const handleContentClick = () => {
    if (!isFocused) {
      onFocus();
    }
  };

  return (
    <div
      ref={windowRef}
      className={`${styles['window-frame']} ${isFocused ? styles.focused : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width,
        height,
        zIndex
      }}
    >
      <div 
        className={styles['title-bar']} 
        onMouseDown={handleMouseDown}
      >
        <div className={styles['traffic-lights']}>
          <button 
            className={`${styles['traffic-light']} ${styles.close}`}
            onClick={onClose}
            aria-label="Close"
          />
          <button 
            className={`${styles['traffic-light']} ${styles.minimize}`}
            onClick={onMinimize}
            aria-label="Minimize"
          />
          <button 
            className={`${styles['traffic-light']} ${styles.zoom}`}
            aria-label="Zoom"
          />
        </div>
        <span className={styles['window-title']}>{title}</span>
      </div>
      <div 
        className={styles['window-content']}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
