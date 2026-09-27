import { WindowType, WindowState } from '../App';
import styles from './Dock.module.css';

interface DockProps {
  windows: WindowState[];
  openWindow: (id: WindowType) => void;
}

export default function Dock({ windows, openWindow }: DockProps) {
  const dockItems: { id: WindowType; label: string; icon: JSX.Element }[] = [
    {
      id: 'matches',
      label: 'Matches',
      icon: (
        <svg className={styles['dock-icon']} viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      )
    },
    {
      id: 'analysis',
      label: 'Analysis',
      icon: (
        <svg className={styles['dock-icon']} viewBox="0 0 24 24">
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
        </svg>
      )
    },
    {
      id: 'coach',
      label: 'Coach',
      icon: (
        <svg className={styles['dock-icon']} viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    },
    {
      id: 'drills',
      label: 'Drills',
      icon: (
        <svg className={styles['dock-icon']} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      )
    }
  ];

  return (
    <div className={styles.dock}>
      {dockItems.map(item => {
        const windowState = windows.find(w => w.id === item.id);
        const isActive = windowState?.isOpen && !windowState?.isMinimized;
        
        return (
          <button
            key={item.id}
            className={`${styles['dock-item']} ${isActive ? styles.active : ''}`}
            onClick={() => openWindow(item.id)}
            aria-label={item.label}
          >
            {item.icon}
          </button>
        );
      })}
    </div>
  );
}
