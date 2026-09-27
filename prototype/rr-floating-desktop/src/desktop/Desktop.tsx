import MenuBar from './MenuBar';
import Dock from './Dock';
import { WindowState, WindowType } from '../App';
import styles from './Desktop.module.css';

interface DesktopProps {
  windows: WindowState[];
  openWindow: (id: WindowType) => void;
  children: React.ReactNode;
}

export default function Desktop({ windows, openWindow, children }: DesktopProps) {
  return (
    <div className={styles.desktop}>
      <MenuBar />
      <div className={styles['windows-container']}>
        {children}
      </div>
      <Dock windows={windows} openWindow={openWindow} />
    </div>
  );
}
