import { useState } from 'react';
import { Problem } from '../mock/data';
import styles from './ProblemWindow.module.css';

interface ProblemWindowProps {
  problem?: Problem;
}

type ViewMode = 'clip' | 'radar';

export default function ProblemWindow({ problem }: ProblemWindowProps) {
  const [largeView, setLargeView] = useState<ViewMode>('clip');

  if (!problem) {
    return (
      <div className={styles['problem-window']}>
        <div style={{ padding: '32px', color: 'var(--muted)', textAlign: 'center' }}>
          Select a problem to view evidence
        </div>
      </div>
    );
  }

  const swapViews = () => {
    setLargeView(prev => prev === 'clip' ? 'radar' : 'clip');
  };

  return (
    <div className={styles['problem-window']}>
      <div className={styles['problem-header']}>
        <div className={styles['problem-round']}>Round {problem.round}</div>
        <h2 className={styles['problem-title']}>{problem.title}</h2>
        <p className={styles['problem-claim']}>{problem.claim}</p>
      </div>

      <div className={styles['pip-stage']}>
        <div 
          className={`${styles['media-container']} ${largeView === 'clip' ? styles.large : styles.peek}`}
          onClick={largeView === 'clip' ? undefined : swapViews}
        >
          <ClipView isLarge={largeView === 'clip'} />
        </div>

        <div 
          className={`${styles['media-container']} ${largeView === 'radar' ? styles.large : styles.peek}`}
          onClick={largeView === 'radar' ? undefined : swapViews}
        >
          <RadarView isLarge={largeView === 'radar'} />
        </div>
      </div>

      <div className={styles['problem-controls']}>
        <div className={styles['playback-controls']}>
          <button className={styles['play-button']} aria-label="Play">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
          <span className={`${styles['time-display']} mono`}>
            {problem.timeStart} / {problem.timeEnd}
          </span>
        </div>

        <div className={styles['view-labels']}>
          <span className={`${styles['view-label']} ${largeView === 'clip' ? styles.active : ''}`}>
            Gameplay
          </span>
          <span className={`${styles['view-label']} ${largeView === 'radar' ? styles.active : ''}`}>
            Radar
          </span>
        </div>
      </div>
    </div>
  );
}

function ClipView({ isLarge }: { isLarge: boolean }) {
  return (
    <div className={styles['clip-view']}>
      <div className={styles['clip-placeholder']}>
        <svg 
          className={styles['play-icon']} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
        </svg>
        {isLarge && <span className={styles['clip-label']}>Clip</span>}
      </div>
    </div>
  );
}

function RadarView({ isLarge }: { isLarge: boolean }) {
  return (
    <div className={styles['radar-view']}>
      <span className={styles['radar-label']}>RADAR (PiP)</span>
      <svg className={styles['radar-map']} viewBox="0 0 400 400">
        <rect x="40" y="40" width="320" height="320" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
        
        <rect x="80" y="80" width="80" height="120" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="1" />
        <rect x="240" y="80" width="80" height="120" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="1" />
        <rect x="160" y="140" width="80" height="60" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="1" />
        
        <rect x="80" y="240" width="60" height="80" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="1" />
        <rect x="260" y="240" width="60" height="80" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="1" />
        
        <line x1="40" y1="200" x2="360" y2="200" stroke="#2a2a2a" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="200" y1="40" x2="200" y2="360" stroke="#2a2a2a" strokeWidth="1" strokeDasharray="4 4" />
        
        <circle className={styles['player-dot']} cx="150" cy="180" r="4" />
        <circle className={styles['player-dot']} cx="180" cy="200" r="4" />
        <circle className={styles['player-dot']} cx="220" cy="185" r="4" />
        
        <circle className={styles['enemy-dot']} cx="280" cy="140" r="4" />
        <circle className={styles['enemy-dot']} cx="310" cy="160" r="4" />
      </svg>
    </div>
  );
}
